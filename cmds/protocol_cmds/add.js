"use strict;"
//imports
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

//protocol add subcommand for la-cli
module.exports.command = 'add <files..>'
//provide a description
module.exports.describe = "Add one or more protocols defined via yaml files"
//provide a builder function which
//sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage("Add one or more protocols defined via yaml files:\n\nUsage: $0 protocol add [files..]");
//provide a handler function which is called when this subcommand gets executed
let config;
let api;
module.exports.handler = (argv) => {
    //set file global config
    config = argv;
    //init axios api instance
    api = axios.create({
        baseURL: config.development ? config.developmentAPI : config.productionAPI 
    });
    //the files are now in argv.files
    //read them from the disk
    const files = readFiles(argv.files);
    //try sending them to the API
    uploadProtocols(files)
        .then((protocols) => {
            console.log("succesfully inserted protocols")
            console.info("API Response: ");
            console.info(JSON.stringify(protocols, null, '  '));
        })
        .catch((error) => {
            console.error("error uploading protocols to API!");
            console.error(error);

        })
}

/** Reads the specified files and returns a string representation
 * @params files The files to read
 * @returns An array of strings containing the files which could be read.
 */
function readFiles(files){
    let parsedFiles = [];
    for(let file of files)  {
        //first read from disk
        let input;
        try{
            input = fs.readFileSync(file);
        }
        catch(error){
            console.error("error reading file: " + file);
            console.error(error);
            continue;
        }
        //then parse
        try{
            const parsed = yaml.safeLoad(input);
            //only if reading and parsing was succesful add to parsed files
            parsedFiles.push(parsed);
        }
        catch(error){
            console.error("error parsing file: " + file);
            console.error(error);
            continue;
        }
    }
    return parsedFiles;
}



/** The main Upload function.
 * @param protocols An array of JSON representations of the protocol files to upload
 * @returns The API response if successful otherwise this throws an Error
 */
async function uploadProtocols(protocols){
    //insert the protocols via the api
    //first convert yaml syntax to valid api syntax
    const parsedProtocols = [];
    for(const protocol of protocols) {
        if(!protocol.name || !protocol.description) {
            console.warn(`skipping protocol: \n ${JSON.stringify(protocol)}\n needs both a description and a name`);
            continue;
        }
        let identifierToIndex = {};
        try {
            protocol.instructions = await Promise.all(protocol.instructions.map(async (elem, index) => {
                //a instruction is consisted of an instruction identifier
                //as the key to a js object
                //containing description, actions and results
                const instruction = flattenYamlKeyValue(elem);
                //save the index of this instruction identifier
                identifierToIndex[instruction.identifier] = index;
                //make sure its either a simple, equation or timer instruction
                if(instruction.equation && instruction.timerDuration) {
                    throw new Error(`instruction: ${JSON.stringify(instruction)}\n has both 'equation' and 'timerDuration' defined!`);
                }
                //upload the image
                const ipath = guessImagePath(instruction);
                instruction.imageId = await uploadImage(ipath);
                //parse results but dont set target instruction ids yet.
                //this will decode the description and upload any images
                instruction.results = await Promise.all(instruction.results.map(async (elem) => {
                    return await parseResult(instruction, elem)
                }));
                //parse any actions
                if(instruction.actions instanceof Array
                && instruction.actions.length > 0) {
                    instruction.actions = instruction.actions.map((elem) => {
                        if(!elem.identifier || !elem.action){
                            throw new Error(`error in instruction:\n${JSON.stringify(instruction)}\nat action: ${JSON.stringify(action)}`);
                        }
                        //get all important info out
                        const { identifier, action, equationIdentifier, ...args } = elem;
                        //and put all non standard keys into arguments
                        return { identifier, action, equationIdentifier, arguments: args};
                    })
                }
                //return the finished instruction
                return instruction;
            }));
        }
        catch(error) {
            console.warn(`error while parsing instructions in protocol '${protocol.name}'\nerror: `, error);
            return;
        }
        //fix target instruction ids which correspond to index in the json array for protocol creation
        try {
            protocol.instructions = protocol.instructions.map((elem) => {
                elem.results = elem.results.map((result) => {
                    const id = result.nextInstruction;
                    if(!id) {
                        //only the last instruction will have a null nextInstruction 
                        return { targetInstructionId: null, ...result};
                    }
                    const index = identifierToIndex[id];
                    if(index) {
                        return { targetInstructionId: index, ...result};
                    }
                    else{
                        throw new Error(`couldnt find instruction with identifier: ${id}, 
                            referenced in instruction: \n ${JSON.stringify(elem)}`);
                    }
                });
                return elem;
            });
        
        }
        catch(error) {
            console.warn(`error while setting up target instruction ids in protocol ${protocol.name}\n error:\n`, error);
            return;
        }
        //save this protocol
        parsedProtocols.push(protocol);
    }
    //second POST the protocol json to the protocol api
    //post the request
    let responses = [];
    for(let protocol of parsedProtocols){
        try {
            let res = await api.post(config.apiProtocolEndpoint, protocol);
            if(res.status == 200 && res.data.success){
                responses.push(res.data.payload);
            }
            else throw new Error(`invalid status code ${res.status} or success flag not set from api`);
        }
        catch(error) {
            console.warn(`error while POSTing the protocol to the Labor-API at ${config.apiUrl}${config.apiProtocolEndpoint}
            \n protocol: `, protocol, '\n error:', error);
        }
    }
    return responses;
}

/** Parses a API correct result object from the yaml syntax.
 * Two Syntax styles are supported:
 * - Short Syntax
 *   ```javascript
 *   {
 *      'a result description': 'target instruction identifier'
 *   }
 *   ```
 * - Long Syntax
 *   ```javascript
 *   {
 *      description: 'a result description', //required
 *      nextInstruction: 'an instruction identifier', //required
 *      imagePath: '/path/to/image/' //optional
 *   }
 *  @param instruction The already parsed instruction to which this result belongs.
 *  @param rawResult The parsed but not yet decoded yaml representation. If the given js object has more than 2 keys, it will be
 *  treated as being in the long syntax.
 *  @return a decoded and parsed result ready for the labor-api.
 *  @throws Error If the result cannot be decoded.
 */
async function parseResult(instruction, rawResult) {
    if(!rawResult) throw new Error('cant decode null raw result');
    if(Object.keys(rawResult).length >= 2) {
        //long syntax 
        //no need to flatten
        if(!rawResult.description) throw new Error(`cant decode result in long syntax without description, at instruction \n ${JSON.stringify(instruction)}\nresult: ${rawResult}}`);
        let path = guessImagePath(instruction, rawResult);
        rawResult.imageId = await uploadImage(path);
        return rawResult;
    }
    else if(Object.keys(rawResult).length == 1) {
        //short syntax 
        //this will flatten the yaml kv object in to { description: '...', metadata: 'next instruction id' }
        const result = flattenYamlKeyValue(rawResult, 'description');
        result.nextInstruction = result.metadata;
        delete result.metadata;
        let path = guessImagePath(instruction, result);
        result.imageId = await uploadImage(path);
        return result;
    }
    else {
       //no keys at all -> malformed 
       throw new Error('cant decode raw result without any keys');
    }
}

/** Guesses an image path from the given instruction and result index
 * If result index is null only a instruction image path will generated.
 * If imagePath is set on either the instruction or the result this path will be returned instead of a generated path.
 * An instruction image path is construction like this: `{instructionIdentifier}.{config.defaultImageExtension}`
 * An result image path is constructed like this: `{instructionIdentifier}_result_{resultIndex}.{config.defaultImageExtension`
 * @param The instruction to use 
 * @param result The result for which to generate the imagePath, may be null. In that case only an instruction imagePath 
 * will be generated
 * @returns The guessed imagePath or null if something went wrong
 */
function guessImagePath(instruction, result = null) {
    if(!instruction) return null;
    if(instruction.imagePath && !result) return instruction.imagePath;
    if(result && result.imagePath) return result.imagePath;

    let ipath = `${instruction.identifier}`;
    if(result) {
        if(instruction.results && instruction.results.indexOf(result) >= 0)
        ipath += `_result_${instruction.results.indexOf(result)}`;
    }
    ipath += `.${config.defaultImageExtension}`;
    return ipath;
}

/** Upload an image to the api/image/ and return the id returned by api 
 * @param ipath the path to image inside the folder defined by the imageBasePath config paramter
 *  @returns The image id returned by the api or null if something failed
 **/
async function uploadImage(ipath){
    let fullPath = path.join(config.imageBasePath, ipath);
    if(!fs.existsSync(fullPath)) {
        console.warn(`couldnt find image at path: ${fullPath}, does it exist?`);
        return null;
    }
    //create read stream for image
    let imageStream = fs.createReadStream(fullPath);
    //create form data object
    const form = new FormData();
    //set the image field
    form.append('image', imageStream);
    //post the request
    let res = await api.post(config.apiImageEndpoint, form, {
        headers: form.getHeaders()
    });
    if(res.status == 200 && res.data.success && res.data.payload.id){
        //the image was sucessfully uploaded
        return res.data.payload.id;
    }
    else{
        console.warn(`recieved strange response from image api:\n${JSON.stringify(res.data, null, '  ')} \n while trying to upload image at path: ${fullPath}`);
        return null;
    }
}

/** flatten a yaml key value to a single object with the key as a property
 * "name": {                   {
 *      imagePath: "..", ==>        nameKey: "name",
 *      results: [..]               imagePath: "..",
 * }                                results: [..]
 *                              }
 */
function flattenYamlKeyValue(source, nameKey = "identifier"){
    const keys = Object.keys(source);
    if(keys.length > 1 || keys.length < 1) throw new Error("malformed key value: " + source)
    const description = keys[0];
    const metadata = source[description];
    //this flattens the metadata object into the new object
    let flattend = {};
    flattend[nameKey] = description;
    if(metadata instanceof Object && Object.keys(metadata).length > 1) {
        return { ...flattend , ...metadata };
    }
    else return {...flattend, metadata: metadata};
}
