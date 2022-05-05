const { DynamoDB, S3 } = require('aws-sdk');
const { ModelDerivativeClient } = require('forge-server-utils');
const { JOBS_TABLE, ARTIFACTS_BUCKET } = process.env;

const db = new DynamoDB({ apiVersion: '2012-08-10' });
const s3 = new S3({ apiVersion: '2006-03-01' });

exports.handler = async (event) => {
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
        return {
            statusCode: err.statusCode || 500,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            }
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
        if (!result || !result.Item) {
            return {
                statusCode: 404,
                headers: {
                    "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
                }
            };
        }
        const job = result.Item;

        console.log('Generating signed URLs');
        const availableArtifacts = job.Artifacts?.M || {};
        const requestedArtifactTypes = event.queryStringParameters?.types
            ? event.queryStringParameters.types.split(',')
            : ['Svf', 'Gltf', 'Glb', 'GlbDraco', 'Usdz'];
        const signedUrls = {};
        for (const artifactType of requestedArtifactTypes) {
            if (availableArtifacts[artifactType]) {
                const signedUrl = await s3.getSignedUrlPromise('getObject', {
                    Key: availableArtifacts[artifactType].S,
                    Bucket: ARTIFACTS_BUCKET,
                    Expires: 3600
                });
                signedUrls[artifactType] = signedUrl;
            }
        }
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            },
            body: JSON.stringify(signedUrls)
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
            }
        };
    }
};
