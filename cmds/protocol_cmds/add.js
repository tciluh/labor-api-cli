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
    log.info(`adding protocols`)
    log.info(`got ${argv.files.length} files.`);
    argv.files.forEach(file => log.verbose(`- ${path.normalize(file)}`));
    //read them from the disk
    const files = readFiles(argv.files);
    //try sending them to the API
    uploadProtocols(files)
        .then((count) => {
            log.info(`succesfully inserted ${count}/${argv.files.length} protocols`)
            if(count == 0 && argv.files.length > 0 ) {
                process.exit(1);
            }
            else{
                process.exit(0);
            }
        })
        .catch((error) => {
            log.error(`critical error adding protocols: `, error);
        })
}

/** Reads the specified files and returns a string representation
 * @params files The files to read
 * @returns An array of strings containing the files which could be read.
 */
function readFiles(files){
    let parsedFiles = new Map();
    for(let file of files)  {
        const fbase = path.basename(file) + ' ';
        log.info(fbase, `reading file`)
        //first read from disk
        let input;
        try{
            input = fs.readFileSync(file);
        }
        catch(error){
            log.error(fbase, `error reading file:\n`, error);
            continue;
        }
        //then parse
        log.info(fbase, `parsing yaml`);
        try{
            const parsed = yaml.safeLoad(input);
            //only if reading and parsing was succesful add to parsed files
            if(parsedFiles.has(file)) {
                log.error(fbase, `file was parsed already. skipping!`);
            }
            else {
                parsedFiles.set(fbase , parsed);
            }
        }
        catch(error){
            log.error(fbase, `error parsing file: `, error);
            continue;
        }
    }
    return parsedFiles;
}



/** The main Upload function.
 * @param protocols A Map of filename to JSON representations of the protocol files to upload
 * @returns The API response if successful otherwise this throws an Error
 */
async function uploadProtocols(protocols){
    //insert the protocols via the api
    let completed = 0;
    for(const [file, protocol] of protocols) {
        log.info(file, 'parsing protocol syntax');
        if(!protocol.name || !protocol.description) {
            console.error(file, ` protocol has no description or name.`);
            continue;
        }
        let identifierToIndex = {};
        log.info(file, `parsing instructions & results`);
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
                    throw new Error(`instruction: ${instruction.identifier}\n has both 'equation' and 'timerDuration' defined!`);
                }
                //upload the image
                let ipath = guessImagePath(instruction);
                //append protocol base image path
                if(protocol.imageBasePath) {
                    ipath = path.join(protocol.imageBasePath, ipath);
                }
                try {
                    instruction.imageId = await uploadImage(ipath);
                }
                catch(error) {
                    if(instruction.imagePath) {
                        log.error(file, `instruction: ${instruction.identifier} `, `error while uploading image: `, error);
                        throw new Error();
                    }
                    else {
                        //do nothing. this path was guessed. 
                    }
                }
                //parse results but dont set target instruction ids yet.
                //this will decode the description and upload any images
                try {
                    instruction.results = await Promise.all(instruction.results.map(async (elem) => {
                        try {
                            const results = await parseResult(protocol, instruction, elem);
                            return results;
                        }
                        catch(error) {
                            throw error; 
                        }
                    }));
                }
                catch(error) {
                    log.error(file, `instruction: ${instruction.identifier} `, `error while parsing results: `, error);
                    throw new Error();
                }
                //parse any actions
                if(instruction.actions instanceof Array
                && instruction.actions.length > 0) {
                    instruction.actions = instruction.actions.map((elem) => {
                        if(!elem.identifier || !elem.action){
                            throw new Error(`instruction: ${instruction.identifier} action : ${JSON.stringify(elem, null, '\t')} is missing identifier or action`);
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
            log.error(file, `error while parsing instructions: `, error);
            continue;
        }
        //fix target instruction ids which correspond to index in the json array for protocol creation
        log.info(file, `setting up instruction<->result relationships`);
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
            log.error(file,`error while setting up relationships: `, error);
            continue;
        }
        //uploading to api
        log.info(file, `uploading to api at: ${api.defaults.baseURL}`)
        try {
            const res = await api.post(config.apiProtocolEndpoint, protocol);
            if(res.status == 200 && res.data.success){
                log.info(file, `upload complete`)
                completed++;
            }
            else throw new Error(`invalid status code ${res.status} or success flag not set from api`);
        }
        catch(error) {
            log.error(file, `error while uploading protocol: `, error) 
            continue;
        }
    }
    return completed;
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
 *  @param protocol The protocol to which this results belongs
 *  @param instruction The already parsed instruction to which this result belongs.
 *  @param rawResult The parsed but not yet decoded yaml representation. If the given js object has more than 2 keys, it will be
 *  treated as being in the long syntax.
 *  @return a decoded and parsed result ready for the labor-api.
 *  @throws Error If the result cannot be decoded.
 */
async function parseResult(protocol, instruction, rawResult) {
    if(!rawResult) throw new Error('cant decode null raw result');
    if(Object.keys(rawResult).length >= 2) {
        //long syntax 
        //no need to flatten
        if(!rawResult.description) throw new Error(`cant decode result in long syntax without description, at instruction \n ${JSON.stringify(instruction)}\nresult: ${rawResult}}`);
        let ipath = guessImagePath(instruction, rawResult);
        if(protocol.imageBasePath) {
            ipath = path.join(protocol.imageBasePath, ipath);
        }
        try{
            rawResult.imageId = await uploadImage(ipath);
        }
        catch(error) {
            if(rawResult.imagePath) {
                throw error;
            }
            else {
                //do nothing. the path was guessed. 
            }
        }
        return rawResult;
    }
    else if(Object.keys(rawResult).length == 1) {
        //short syntax 
        //this will flatten the yaml kv object in to { description: '...', metadata: 'next instruction id' }
        const result = flattenYamlKeyValue(rawResult, 'description');
        result.nextInstruction = result.metadata;
        delete result.metadata;
        let ipath = guessImagePath(instruction, result);
        if(protocol.imageBasePath) {
            ipath = path.join(protocol.imageBasePath, ipath);
        }
        try {
            result.imageId = await uploadImage(path);
        }
        catch(error) {
            if(result.imagePath) {
                throw error; 
            }
            else {
                //do nothing. the path was guessed. 
            }
        }
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
    log.debug(`guessing image path for i: `, instruction, ` r: `, result);
    if(!instruction) return null;
    if(instruction.imagePath && !result) return instruction.imagePath;
    if(result && result.imagePath) return result.imagePath;

    let ipath = `${instruction.identifier}`;
    if(result) {
        if(instruction.results && instruction.results.indexOf(result) >= 0)
        ipath += `_result_${instruction.results.indexOf(result)}`;
    }
    ipath += `.${config.defaultImageExtension}`;
    log.debug(`guessed path: `, ipath);
    return ipath;
}

/** Upload an image to the api/image/ and return the id returned by api 
 * @param ipath the path to image inside the folder defined by the imageBasePath config paramter
 * @returns The image id returned by the api or null if something failed
 * @throws Error If the image upload failed.
 **/
async function uploadImage(ipath){
    let fullPath = path.join(config.imageBasePath, ipath);
    if(!fs.existsSync(fullPath)) {
        throw new Error(`couldnt find image at path: ${fullPath}, does it exist?`);
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
        throw new Error(`recieved strange response from image api:`, res.data, `while trying to upload image at path: ${fullPath}`);
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
