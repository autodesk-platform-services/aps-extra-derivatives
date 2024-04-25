const { DynamoDB } = require('aws-sdk');
const { ModelDerivativeClient } = require('aps-sdk-node');
const { JOBS_TABLE } = process.env;

const db = new DynamoDB({ apiVersion: '2012-08-10' });

exports.handler = async (event) => {
    let response;
    const { urn, guid } = event.pathParameters;
    const token = (event.headers['Authorization'] || '').replace('Bearer ', '');
    console.assert(urn);
    console.assert(guid);
    console.assert(token);

    console.log('URN', urn);
    console.log('GUID', guid);

    try {
        console.log('Checking authorization');
        const modelDerivativeClient = new ModelDerivativeClient({ token });
        await modelDerivativeClient.getManifest(urn);
        // TODO: check if the specified GUID exists
    } catch (err) {
        console.error(err);
        response = {
            statusCode: err.statusCode || 500
        };
        return;
    }

    try {
        console.log('Retrieving job status');
        const result = await db.getItem({
            TableName: JOBS_TABLE,
            Key: {
                UrnGuid: { S: `${urn}#${guid}` }
            }
        }).promise();
        if (result && result.Item) {
            response = {
                statusCode: 200,
                body: JSON.stringify({
                    urn, guid,
                    step: result.Item?.ConversionStep?.S,
                    status: result.Item?.ConversionStatus?.S
                })
            };
        } else {
            response = {
                statusCode: 404
            };
        }
    } catch (err) {
        console.error(err);
        response = {
            statusCode: 500
        };
    }

    response.headers = {
        "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
    };
    return response;
};
