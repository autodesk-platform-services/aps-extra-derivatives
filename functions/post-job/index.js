const { DynamoDB, StepFunctions } = require('aws-sdk');
const { ModelDerivativeClient } = require('forge-server-utils');
const { JOBS_TABLE, CONVERSION_STEP_FUNCTION } = process.env;

const db = new DynamoDB({ apiVersion: '2012-08-10' });
const sf = new StepFunctions({ apiVersion: '2016-11-23' });

async function startConversion(urn, guid, token, region) {
    const params = {
        // name: `${urn}#${guid}`, // Must be less than 80 characters
        input: JSON.stringify({ urn, guid, token, region }),
        stateMachineArn: CONVERSION_STEP_FUNCTION
    };
    const result = await sf.startExecution(params).promise();
    return result;
}

exports.handler = async (event) => {
    const { urn, guid } = event.pathParameters;
    const token = (event.headers['Authorization'] || '').replace('Bearer ', '');
    const region = (event?.queryStringParameters?.region === 'emea') ? 'EMEA' : 'US';
    console.assert(urn);
    console.assert(guid);
    console.assert(token);

    console.log('URN', urn);
    console.log('GUID', guid);
    console.log('Region', region);

    try {
        console.log('Checking authorization');
        const modelDerivativeClient = new ModelDerivativeClient({ token }, undefined, region);
        await modelDerivativeClient.getManifest(urn);
        // TODO: check if the specified GUID exists
    } catch (err) {
        console.error(err);
        return {
            statusCode: err.statusCode || 500,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            },
            body: JSON.stringify({
                message: 'URN does not exist, or it cannot be accessed with the provided token'
            })
        };
    }

    try {
        console.log('Attempting to create new job');
        await db.putItem({
            TableName: JOBS_TABLE,
            Item: {
                UrnGuid: { S: `${urn}#${guid}` }
            },
            ConditionExpression: 'attribute_not_exists(UrnGuid)'
        }).promise();
    } catch (err) {
        console.error(err);
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            },
            body: JSON.stringify({
                message: 'Job already exists'
            })
        };
    }

    try {
        console.log('Kicking-off conversion');
        await startConversion(urn, guid, token, region);
    } catch (err) {
        console.error(err);
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            },
            body: JSON.stringify({
                message: 'Failed to start conversion'
            })
        };
    }

    try {
        console.log('Retrieving job status');
        const result = await db.getItem({
            TableName: JOBS_TABLE,
            Key: {
                UrnGuid: { S: `${urn}#${guid}` }
            }
        }).promise();
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            },
            body: JSON.stringify({
                urn, guid,
                step: result.Item?.ConversionStep?.S,
                status: result.Item?.ConversionStatus?.S
            })
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            },
            body: JSON.stringify({
                message: 'Could not retrieve job status'
            })
        };
    }
};
