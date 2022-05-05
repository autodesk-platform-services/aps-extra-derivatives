const path = require('path');
const fse = require('fs-extra');
const { gltfToGlb } = require('gltf-pipeline');
const { downloadArtifact, uploadArtifact, decompress } = require('/opt/nodejs/helpers.js');

async function convert(inputGltfPath, outputGlbPath) {
    const gltf = fse.readJsonSync(inputGltfPath);
    const options = {
        resourceDirectory: path.dirname(inputGltfPath)
    };
    const result = await gltfToGlb(gltf, options);
    fse.ensureDirSync(path.dirname(outputGlbPath));
    fse.writeFileSync(outputGlbPath, result.glb);
}

exports.handler = async (event) => {
    const { urn, guid } = event;
    console.assert(urn);
    console.assert(guid);

    console.log('URN', urn);
    console.log('GUID', guid);

    try {
        const tmpFolder = `/tmp/${urn}/${guid}`;
        fse.ensureDirSync(tmpFolder);
        console.log('Downloading glTF artifact');
        await downloadArtifact(`${urn}/${guid}/gltf.zip`, `${tmpFolder}/gltf.zip`);
        console.log('Decompressing glTF assets');
        await decompress(`${tmpFolder}/gltf.zip`, `${tmpFolder}/gltf`);
        console.log('Converting glTF to glb');
        await convert(`${tmpFolder}/gltf/output.gltf`, `${tmpFolder}/glb/output.glb`);
        console.log('Uploading glb artifact');
        await uploadArtifact(`${tmpFolder}/glb/output.glb`, `${urn}/${guid}.glb`);
        fse.removeSync(tmpFolder);
    } catch (err) {
        console.error(err);
        return {
            urn, guid,
            status: 'error',
            message: err
        };
    }
    return {
        urn, guid,
        status: 'success',
        output: `${urn}/${guid}.glb`
    };
};
