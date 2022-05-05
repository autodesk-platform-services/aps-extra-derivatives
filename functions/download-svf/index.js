const path = require('path');
const fse = require('fs-extra');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('forge-convert-utils');
const { uploadArtifact, compress } = require('/opt/nodejs/helpers.js');

async function download(urn, guid, token, outputFolder) {
    const modelDerivativeClient = new ModelDerivativeClient({ token });
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const derivatives = helper.search({ guid, type: 'resource', role: 'graphics' });
    if (derivatives.length === 0) {
        throw new Error(`Could not find derivative with GUID ${guid}`);
    }
    const derivative = derivatives[0];
    if (derivative.mime !== 'application/autodesk-svf') {
        throw new Error(`Unexpected derivative MIME type ${derivative.mime}`);
    }
    const svf = await modelDerivativeClient.getDerivative(urn, encodeURI(derivative.urn));
    fse.ensureDirSync(outputFolder);
    fse.writeFileSync(path.join(outputFolder, 'output.svf'), new Uint8Array(svf));
    const reader = await SvfReader.FromDerivativeService(urn, guid, { token });
    const manifest = await reader.getManifest();
    for (const asset of manifest.assets) {
        if (!asset.URI.startsWith('embed:')) {
            console.log(`Downloading asset ${asset.URI}`);
            const assetData = await reader.getAsset(asset.URI);
            const assetPath = path.join(outputFolder, asset.URI);
            const assetFolder = path.dirname(assetPath);
            fse.ensureDirSync(assetFolder);
            fse.writeFileSync(assetPath, assetData);
        }
    }
    // TODO: download at least some files in parallel
}

exports.handler = async (event) => {
    const { urn, guid, token } = event;
    console.assert(urn);
    console.assert(guid);
    console.assert(token);

    console.log('URN', urn);
    console.log('GUID', guid);

    try {
        const tmpFolder = `/tmp/${urn}/${guid}`;
        fse.ensureDirSync(tmpFolder);
        console.log('Downloading SVF assets');
        await download(urn, guid, token, `${tmpFolder}/svf/${urn}/${guid}`);
        console.log('Compressing SVF assets');
        await compress(`${tmpFolder}/svf`, `${tmpFolder}/svf.zip`);
        console.log('Uploading SVF artifact');
        await uploadArtifact(`${tmpFolder}/svf.zip`, `${urn}/${guid}/svf.zip`);
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
        output: `${urn}/${guid}/svf.zip`
    };
};
