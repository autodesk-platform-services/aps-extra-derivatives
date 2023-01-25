const APS_CLIENT_ID = 'gnChEZ6tph1H9IAelM2mYufYZVU1qqKt';
const API_HOST = 'https://m5ey85w3lk.execute-api.us-west-2.amazonaws.com';

// Check if new access token is provided in the URL
const { hash } = window.location;
if (hash.length > 0) {
    const params = new Map();
    hash.substr(1).split('&').forEach(pair => {
        const tokens = pair.split('=');
        if (tokens.length === 2) {
            params.set(tokens[0], tokens[1]);
        }
    });
    if (params.get('access_token') && params.get('expires_in') && params.get('token_type') === 'Bearer') {
        window.localStorage.setItem('aps_access_token', params.get('access_token'));
        window.localStorage.setItem('aps_token_expires_at', Date.now() + parseInt(params.get('expires_in')) * 1000);
        window.location.hash = '';
    }
}

// Check if the access token has expired, or schedule an expiration
const accessToken = window.localStorage.getItem('aps_access_token');
const expiresAt = window.localStorage.getItem('aps_token_expires_at');
if (accessToken) {
    if (!expiresAt || Date.now() >= parseInt(expiresAt)) {
        window.localStorage.removeItem('aps_access_token');
        window.localStorage.removeItem('aps_token_expires_at');
    } else {
        setTimeout(function () {
            window.localStorage.removeItem('aps_access_token');
            window.localStorage.removeItem('aps_token_expires_at');
            window.location.reload();
        }, parseInt(expiresAt) - Date.now());
    }
}

// Initialize UI depending on the user status
window.ACCESS_TOKEN = window.localStorage.getItem('aps_access_token');
if (window.ACCESS_TOKEN) {
    $('[data-visibility="logged-in"]').show();
    $('#logout').click(() => {
        window.localStorage.removeItem('aps_access_token');
        window.localStorage.removeItem('aps_token_expires_at');
        window.location.reload();
    });
    window.bim360Client = new forge.BIM360Client({ token: window.ACCESS_TOKEN });
    window.modelDerivativeClient = new forge.ModelDerivativeClient({ token: window.ACCESS_TOKEN });
    updateHubsDropdown();
} else {
    $('[data-visibility="logged-out"]').show();
    $('#login').click(() => {
        const url = new URL('https://developer.api.autodesk.com/authentication/v1/authorize');
        url.searchParams.set('client_id', APS_CLIENT_ID);
        url.searchParams.set('redirect_uri', window.location.protocol + '//' + window.location.host);
        url.searchParams.set('response_type', 'token');
        url.searchParams.set('scope', 'data:read viewables:read');
        window.location.replace(url.toString());
    });
}

async function updateHubsDropdown() {
    const $hubs = $('#hubs');
    const hubs = await window.bim360Client.listHubs();
    for (const hub of hubs) {
        $hubs.append(`<option value="${hub.id}">${hub.name}</option>`);
    }
    $hubs.off('change').on('change', () => updateProjectsDropdown());
    $hubs.trigger('change');
}

async function updateProjectsDropdown() {
    const $projects = $('#projects');
    $projects.empty();
    const projects = await window.bim360Client.listProjects($('#hubs').val());
    for (const project of projects) {
        $projects.append(`<option value="${project.id}">${project.name}</option>`);
    }
    $projects.off('change').on('change', () => updateDocumentTree());
    $projects.trigger('change');
}

async function updateDocumentTree() {
    // Icon URLs: https://icongr.am/octicons
    const $tree = $('#tree');
    $tree.jstree('destroy');
    $tree.jstree({
        core: {
            data: async function (obj, callback) {
                const hubId = $('#hubs').val();
                const projectId = $('#projects').val();
                if (obj.id === '#') {
                    const folders = await window.bim360Client.listTopFolders(hubId, projectId);
                    callback(folders.map(folder => {
                        folder.type = 'folders';
                        return {
                            text: folder.displayName,
                            id: folder.id,
                            children: true,
                            data: folder,
                            icon: `https://icongr.am/octicons/file-directory.svg`
                        };
                    }));
                } else if (obj.data.type === 'folders') {
                    const contents = await window.bim360Client.listContents(projectId, obj.id);
                    callback(contents.map(entry => {
                        return {
                            text: entry.displayName,
                            id: entry.id,
                            children: true,
                            data: entry,
                            icon: `https://icongr.am/octicons/${(entry.type === 'folders') ? 'file-directory' : 'file'}.svg`
                        };
                    }));
                } else if (obj.data.type === 'items') {
                    //const versions = await window.bim360Client.listVersions(projectId, obj.id);
                    const tipVersion = await window.bim360Client.getTipVersion(projectId, obj.id);
                    const urn = btoa(tipVersion.id).replace('=', '').replace('/', '_');
                    try {
                        const resp = await window.modelDerivativeClient.getMetadata(urn);
                        const { metadata } = resp.data;
                        callback(metadata.filter(viewable => viewable.role === '3d').map(viewable => {
                            return {
                                text: viewable.name,
                                id: `${viewable.guid}`,
                                data: { type: 'viewable', urn, guid: viewable.guid },
                                children: false,
                                icon: `https://icongr.am/octicons/file-media.svg`
                            };
                        }));
                    } catch (err) {
                        callback([]);
                    }
                }
            }
        }
    }).on('changed.jstree', async function (ev, data) {
        const obj = data?.node?.data;
        if (obj && obj.type === 'viewable') {
            updatePreview(obj.urn, obj.guid);
        }
    });
}

async function updatePreview(urn, guid) {
    const $preview = $('#preview');
    $preview.text('Loading...');

    try {
        const resp = await fetch(`${API_HOST}/Prod/jobs/${urn}/${guid}`, {
            headers: { 'Authorization': 'Bearer ' + window.ACCESS_TOKEN }
        });
        if (resp.ok) {
            const job = await resp.json();
            updatePreviewAvailable(urn, guid, job);
        } else if (resp.status === 404) {
            updatePreviewUnavailable(urn, guid);
        } else {
            console.error(resp);
            throw new Error(await resp.text());
        }
    } catch (err) {
        console.error(err);
        $preview.empty();
        $preview.append(`
            <div class="alert alert-danger">
                Could not retrieve job status. See console for more details.
            </div>
        `);
    }
}

async function updatePreviewAvailable(urn, guid, job) {
    const $preview = $('#preview');
    $preview.empty();
    switch (job.status) {
        case 'inprogress':
            $preview.append(`
                <div class="alert alert-info">
                    Translation is in progress. Try again later.
                </div>
            `);
            $preview.append(`<button id="refresh-job" class="btn btn-secondary">Refresh</button>`);
            $('#refresh-job').click(() => updatePreview(urn, guid));
            break;
        case 'failed':
            console.error(job);
            $preview.append(`
                <div class="alert alert-danger">
                    Translation failed. See console for more details.
                </div>
            `);
            break;
        case 'success':
            try {
                const resp = await fetch(`${API_HOST}/Prod/jobs/${urn}/${guid}/signedurl`, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + window.ACCESS_TOKEN }
                });
                if (!resp.ok) {
                    console.error(resp);
                    throw new Error(await resp.text());
                }
                const urls = await resp.json();
                $preview.append(`
                    <div class="cards">
                        <div id="preview-${urn}-${guid}" class="card">
                            ${urls['GlbDraco'] ? `<div class="card-img-top"><model-viewer class="model-preview" src="${urls['GlbDraco']}" alt="glb preview" auto-rotate camera-controls ar ar-modes="webxr scene-viewer quick-look fallback" ar-scale="auto"></model-viewer></div>`: ''}
                            <div class="card-body">
                                <h5 class="card-title">Outputs</h5>
                                <table id="outputs-${urn}-${guid}" class="table table-hover table-sm">
                                    <thead>
                                        <tr>
                                            <th scope="col"></th>
                                            <th scope="col"></th>
                                            <th scope="col"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${
                                            Object.keys(urls).map(artifactType => {
                                                const artifactUrl = urls[artifactType];
                                                return `
                                                    <tr id="output-${urn}-${guid}-${artifactType}">
                                                        <td>${artifactType}</td>
                                                        <td>
                                                            <a href="${artifactUrl}" class="btn btn-sm btn-outline-secondary">Download</a>
                                                        </td>
                                                        <td>
                                                            <a href="#" data-qr-url="${artifactUrl}" class="btn btn-sm btn-outline-secondary">QR</a>
                                                        </td>
                                                    </tr>
                                                `;
                                            }).join('\n')
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `);
                $('a[data-qr-url]').click((ev) => {
                    const url = $(ev.target).data('qr-url');
                    $('#qr-modal .modal-body').empty().qrcode({
                        width: 512,
                        height: 512,
                        text: url,
                        correctLevel: 0
                    });
                    $('#qr-modal').modal('show');
                });
            } catch (err) {
                console.error(err);
                $preview.append(`
                    <div class="alert alert-danger">
                        Could not access translation outputs. See console for more details.
                    </div>
                `);
            }
            break;
    }
}

async function updatePreviewUnavailable(urn, guid) {
    const $preview = $('#preview');
    $preview.empty();
    $preview.append(`
            <div class="alert alert-info">
                No conversion jobs found.
            </div>
            <button id="start-job" class="btn btn-primary">Start Conversion</button>
        `);
    $('#start-job').click(async () => {
        await fetch(`${API_HOST}/Prod/jobs/${urn}/${guid}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.ACCESS_TOKEN }
        });
        updatePreview(urn, guid);
    });
}
