const fse = require('fs-extra');
const { SvfReader, GltfWriter } = require('svf-utils');
const { downloadArtifact, uploadArtifact, decompress, compress } = require('/opt/nodejs/helpers.js');

async function convert(inputSvfPath, outputDir) {
    const reader = await SvfReader.FromFileSystem(inputSvfPath);
    const scene = await reader.read({
        skipPropertyDb: true
    });
    let writer = new GltfWriter({
        deduplicate: true,
        skipUnusedUvs: false,
        center: true,
        log: console.log
    });
    fse.ensureDirSync(outputDir);
    await writer.write(scene, outputDir);
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
        console.log('Downloading SVF artifact');
        await downloadArtifact(`${urn}/${guid}/svf.zip`, `${tmpFolder}/svf.zip`);
        console.log('Decompressing SVF assets');
        await decompress(`${tmpFolder}/svf.zip`, `${tmpFolder}/svf`);
        console.log('Converting SVF to glTF');
        await convert(`${tmpFolder}/svf/${urn}/${guid}/output.svf`, `${tmpFolder}/gltf`);
        console.log('Compressing glTF assets');
        await compress(`${tmpFolder}/gltf`, `${tmpFolder}/gltf.zip`);
        console.log('Uploading glTF artifact');
        await uploadArtifact(`${tmpFolder}/gltf.zip`, `${urn}/${guid}/gltf.zip`);
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
        output: `${urn}/${guid}/gltf.zip`
    };
};
