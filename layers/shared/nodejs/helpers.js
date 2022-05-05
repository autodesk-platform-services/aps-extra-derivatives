const path = require('path');
const fse = require('fs-extra');
const { S3 } = require('aws-sdk');
const AdmZip = require('adm-zip');

const ArtifactBucketName = process.env.ARTIFACTS_BUCKET;
const s3 = new S3({ apiVersion: '2006-03-01' });

async function compress(srcFolder, destFile) {
    fse.ensureDirSync(path.dirname(destFile));
    const zip = new AdmZip();
    zip.addLocalFolder(srcFolder);
    zip.writeZip(destFile);
}

async function decompress(srcFile, destFolder) {
    fse.ensureDirSync(destFolder);
    const zip = new AdmZip(srcFile);
    zip.extractAllTo(destFolder);
}

async function uploadArtifact(srcFile, objectKey) {
    const stream = fse.createReadStream(srcFile);
    const result = await s3.upload({
        Bucket: ArtifactBucketName,
        Key: objectKey,
        Body: stream
    }).promise();
    return result;
}

async function downloadArtifact(objectKey, dstFile) {
    // return new Promise(function (resolve, reject) {
    //     const stream = s3.getObject({
    //         Bucket: ArtifactBucketName,
    //         Key: objectKey,
    //     }).createReadStream();
    //     stream.on('end', resolve); 
    //     stream.on('error', reject); 
    //     stream.pipe(fse.createWriteStream(dstFile));
    // });
    const result = await s3.getObject({ Bucket: ArtifactBucketName, Key: objectKey }).promise();
    fse.ensureDirSync(path.dirname(dstFile));
    fse.writeFileSync(dstFile, result.Body);
}

module.exports = {
    compress,
    decompress,
    uploadArtifact,
    downloadArtifact
};
