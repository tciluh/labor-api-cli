"use strict;"
//imports
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const yaml = require('js-yaml');

//protocol add subcommand for la-cli
module.exports.command = 'add <files..>'
//provide a description
module.exports.describe = "Add one or more protocols defined via yaml files"
//provide a builder function which
//sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage("Add one or more protocols defined via yaml files:\n\nUsage: $0 protocol add [files..]");
//provide a handler function which is called when this subcommand gets executed
module.exports.handler = (argv) => {
    //the files are now in argv.files
    //read them from the disk
    const files = readFiles(argv.files);
    //try sending them to the API
    uploadProtocols(files, argv)
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
async function uploadProtocols(protocols, argv){
    //insert the protocols via the api
    //first insert the images
    for(let i = 0; i < protocols.length; ++i){
        let protocol = protocols[i];
        let newInstructions = [];
        for(let k = 0; k < protocol.instructions.length; k++){
            let instruction = protocol.instructions[k];
            //instruction is an object with one key value pair
            //where key => description //value => metadata (imagePath, results)
            //therefore flatten it
            let newInstruction = flattenYamlKeyValue(instruction)
            if(newInstruction.equation != null && newInstruction.timerDuration != null){
                throw new Error("an instruction can't have both an equation and a timerDuration.");
            }
            //upload the image of this instruction
            newInstruction = await uploadImage(newInstruction, argv, k);
            //deal with the results
            let newResults = [];
            for(let l = 0; l < newInstruction.results.length; l++){
                const result = newInstruction.results[l];
                //same situation as with the results
                //flatten the source object
                let newResult = flattenYamlKeyValue(result);
                //upload the image of this result
                newResult = await uploadImage(newResult, argv, k, l);
                //rename the nextInstruction key to targetInstructionId which is the expected key in the database
                newResult.targetInstructionId = newResult.nextInstruction;
                //delete the old key
                delete newResult.nextInstruction;
                //add to new results array
                newResults.push(newResult);
            }
            newInstruction.results = newResults;
            //deal with actions
            if(newInstruction.actions){
                let newActions = [];
                for(let srcAction of newInstruction.actions){
                    //same situation as with the results
                    //except the flattened key is identifier instead of description
                    //flatten
                    const flat = flattenYamlKeyValue(srcAction, 'identifier');
                    //the tricky part is now that the server expects an action of the following format
                    //{
                    //    identifier: 'photometer',
                    //    action: 'measure',
                    //    arguments: {
                    //        someKey: 420
                    //    }
                    //}
                    //we solve this with the help of some fine deconstructuring magic
                    let { identifier, action, equationIdentifier, ...args } = flat;
                    newActions.push({
                        identifier: identifier,
                        action: action,
                        equationIdentifier: equationIdentifier,
                        arguments: args
                    });
                }
                //update on newInstruction obj
                newInstruction.actions = newActions;
            }
            //add this instruction to the list of finished ones
            newInstructions.push(newInstruction);
        }
        protocol.instructions = newInstructions;
    }
    //second POST the protocol json to the protocol api
    //post the request
    let responses = [];
    for(let protocol of protocols){
        //axios
        let res = await axios.post(argv.apiURL + argv.apiProtocolEndpoint, protocol);
        if(res.status == 200 && res.data.success){
            responses.push(res.data.payload);
        }
    }
    return responses;
}
//helper functions
/** Upload an image to the api/image/ endpoint specified by the imagePath key inside object.
 *  @returns the modified object.
 **/
async function uploadImage(object, argv, instruction_index = null, result_index = null){
    //check if the object is there and the required key imagePath is not null
    if(!object) throw new Error("cant upload image for null object");
    let imagePath;
    if(!object.imagePath){
        //try to guess the file name if none was given.
        //the filename should have a structure like this <instruction index>r<result index>.png
        let path = "" + instruction_index;
        if(result_index != null) {
            path += "r" + result_index; 
        }
        //add extension
        path += "." + argv.defaultImageExtension
        //check if the file exists
        //checkExistsSync is not deprecated and should be used here.
        if(fs.existsSync(argv.imageBasePath + path)){
            imagePath = path
        }
        else{
            console.warn(`image path for object: ${object} is not defined and couldnt be guessed. path: ${path} does not exist. skipping this image`);
            //we still need to set the imageId and delete the imagePath key
            object.imageId = null;
            delete object.imagePath;
            return object;
        }
    }
    else{
        imagePath = object.imagePath;
    }
    //create read stream for image
    let imageStream = fs.createReadStream(argv.imageBasePath + imagePath);
    //create form data object
    const form = new FormData();
    //set the image field
    form.append('image', imageStream);
    //post the request
    let res = await axios.post(argv.apiURL + argv.apiImageEndpoint, form, {
        headers: form.getHeaders()
    });
    if(res.status == 200 && res.data.success && res.data.payload.id){
        //the image was sucessfully uploaded
        //set the imageId
        object.imageId = res.data.payload.id;
        //delete the imagePath key
        delete object.imagePath;
        return object;
    }
    else throw new Error("recieved strange response from image api:\n" + JSON.stringify(res.data, null, '  '));
}

/** flatten a yaml key value to a single object with the key as a property
 * "name": {                   {
 *      imagePath: "..", ==>        nameKey: "name",
 *      results: [..]               imagePath: "..",
 * }                                results: [..]
 *                              }
 */
function flattenYamlKeyValue(source, nameKey = "description"){
    const keys = Object.keys(source);
    if(keys.length > 1 || keys.length < 1) throw new Error("malformed key value: " + source)
    const description = keys[0];
    const metadata = source[description];
    //this flattens the metadata object into the new object
    let flattend = {};
    flattend[nameKey] = description;
    return { ...flattend , ...metadata };
}
