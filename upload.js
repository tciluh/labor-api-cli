"use strict;"

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function uploadImage(object, config){
    //check if the object is there and the required key imagePath is not null
    if(!object) throw new Error("cant upload image for null object");
    if(!object.imagePath){
        console.warn("image path for object: " + object + " is not defined. skipping this image");
        //we still need to set the imageId and delete the imagePath key
        object.imageId = null;
        delete object.imagePath;
        return object;
    }
    //create read stream for image
    let imageStream = fs.createReadStream(config.imageBasePath + object.imagePath);
    //create form data object
    const form = new FormData();
    //set the image field
    form.append('image', imageStream);
    //post the request
    let res = await axios.post(config.apiURL + config.apiImageEndpoint, form, {
        headers: form.getHeaders()
    });
    if(res.status == 200 && res.data && res.data.id){
        //the image was sucessfully uploaded
        //set the imageId
        object.imageId = res.data.id;
        //delete the imagePath key
        delete object.imagePath;
        return object;
    }
    else throw new Error("recieved strange response from image api:\n" + JSON.stringify(res, null, '  '));
}


/** flatten a yaml key value to a single object with the key as a property
 * "name": {                   {
 *      imagePath: "..", ==>        name: "...",
 *      results: [..]               imagePath: "..",
 * }                                results: [..]
 *                              }
 */
function flattenYamlKeyValue(source){
    const keys = Object.keys(source);
    if(keys.length > 1 || keys.length < 1) throw new Error("malformed key value: " + source)
    const description = keys[0];
    const metadata = source[description];
    //this flattens the metadata object into the new object
    return { description: description, ...metadata };
}

async function uploadProtocols(protocols, config){
    //insert the protocols via the api
    //first insert the images
    for(let i = 0; i < protocols.length; ++i){
        let protocol = protocols[i];
        let newInstructions = [];
        for(let instruction of protocol.instructions){
            //instruction is an object with one key value pair
            //where key => description //value => metadata (imagePath, results)
            //therefore flatten it
            let newInstruction = flattenYamlKeyValue(instruction)
            //upload the image of this instruction
            newInstruction = await uploadImage(newInstruction,config);
            //deal with the results
            let newResults = [];
            for(let result of newInstruction.results){
                //same situation as with the results
                //flatten the source object
                let newResult = flattenYamlKeyValue(result);
                //upload the image of this result
                newResult = await uploadImage(newResult, config);
                //rename the nextInstruction key to targetInstructionId which is the expected key in the database
                newResult.targetInstructionId = newResult.nextInstruction;
                //delete the old key
                delete newResult.nextInstruction;
                //add to new results array
                newResults.push(newResult);
            }
            newInstruction.results = newResults;
            newInstructions.push(newInstruction);
        }
        protocol.instructions = newInstructions;
    }
    //second POST the protocol json to the protocol api
    //post the request
    for(let protocol of protocols){
        //axios
        let res = await axios.post(config.apiURL + config.apiProtocolEndpoint, protocol);
        if(res.status == 200 && res.data){
            console.log(JSON.stringify(res.data, null, ' '));
        }
    }
}

module.exports = uploadProtocols;
