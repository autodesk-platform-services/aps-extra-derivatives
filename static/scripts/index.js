const FORGE_CLIENT_ID = 'CUWAG7yAMhe1fLx45AeSJ5HyhulgrbGc';
const API_HOST = 'https://b77marvza6.execute-api.us-east-1.amazonaws.com';

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
        window.localStorage.setItem('forge_access_token', params.get('access_token'));
        window.localStorage.setItem('forge_token_expires_at', Date.now() + parseInt(params.get('expires_in')) * 1000);
        window.location.hash = '';
    }
}

// Check if the access token has expired, or schedule an expiration
const accessToken = window.localStorage.getItem('forge_access_token');
const expiresAt = window.localStorage.getItem('forge_token_expires_at');
if (accessToken) {
    if (!expiresAt || Date.now() >= parseInt(expiresAt)) {
        window.localStorage.removeItem('forge_access_token');
        window.localStorage.removeItem('forge_token_expires_at');
    } else {
        setTimeout(function () {
            window.localStorage.removeItem('forge_access_token');
            window.localStorage.removeItem('forge_token_expires_at');
            window.location.reload();
        }, parseInt(expiresAt) - Date.now());
    }
}

// Initialize UI depending on the user status
window.ACCESS_TOKEN = window.localStorage.getItem('forge_access_token');
if (window.ACCESS_TOKEN) {
    $('[data-visibility="logged-in"]').show();
    $('#logout').click(() => {
        window.localStorage.removeItem('forge_access_token');
        window.localStorage.removeItem('forge_token_expires_at');
        window.location.reload();
    });
    window.bim360Client = new forge.BIM360Client({ token: window.ACCESS_TOKEN });
    window.modelDerivativeClient = new forge.ModelDerivativeClient({ token: window.ACCESS_TOKEN });
    updateHubsDropdown();
} else {
    $('[data-visibility="logged-out"]').show();
    $('#login').click(() => {
        const url = new URL('https://developer.api.autodesk.com/authentication/v1/authorize');
        url.searchParams.set('client_id', FORGE_CLIENT_ID);
        url.searchParams.set('redirect_uri', window.location.protocol + '//' + window.location.host);
        url.searchParams.set('response_type', 'token');
        url.searchParams.set('scope', 'data:read viewables:read');
        window.location.replace(url.toString());
    });
}

function getRegion() {
    const params = new URLSearchParams(window.location.search);
    return params.has('region') ? params.get('region') : 'us';
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
                    const resp = await window.modelDerivativeClient.getMetadata(urn);
                    const metadata = resp.data.metadata;
                    callback(metadata.filter(viewable => viewable.role === '3d').map(viewable => {
                        return {
                            text: viewable.name,
                            id: `${viewable.guid}`,
                            data: { type: 'viewable', urn, guid: viewable.guid },
                            children: false,
                            icon: `https://icongr.am/octicons/file-media.svg`
                        };
                    }));
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
        const resp = await fetch(`${API_HOST}/Prod/jobs/${urn}/${guid}?region=${getRegion()}`, {
            headers: { 'Authorization': 'Bearer ' + window.ACCESS_TOKEN }
        });
        if (resp.ok) {
            const job = await resp.json();
            updatePreviewAvailable(urn, guid, job);
        } else if (resp.status === 404) {
            updatePreviewUnavailable(urn, guid);
        } else {
            throw new Error(await resp.text());
        }
    } catch (err) {
        $preview.empty();
        $preview.append(`
            <div class="alert alert-danger">
                ${err}
            </div>
        `);
    }
}

async function updatePreviewAvailable(urn, guid, job) {
    const $preview = $('#preview');
    $preview.empty();
    if (job.Artifacts && Object.keys(job.Artifacts).length > 0) {
        $preview.append(`
            <div class="cards"></div>
        `);
        const $cards = $('#preview .cards');
        // for (const artifactType of Object.keys(job.Artifacts)) {
        //     const artifact = job.Artifacts[artifactType];
        //     $cards.append(`
        //         <div id="view-${guid}" class="card">
        //             ${viewable.derivatives.glb && viewable.derivatives.glb.url ? `<div class="card-img-top"><model-viewer class="model-preview" src="${viewable.derivatives.glb.url}" alt="glb preview" auto-rotate camera-controls ar ar-modes="webxr scene-viewer quick-look fallback" ar-scale="auto"></model-viewer></div>`: ''}
        //             <div class="card-body">
        //                 <h5 class="card-title">${viewable.name}</h5>
        //                 <table id="output-${guid}" class="table table-hover table-sm">
        //                     <thead>
        //                         <tr>
        //                             <th scope="col"></th>
        //                             <th scope="col"></th>
        //                             <th scope="col"></th>
        //                             <th scope="col"></th>
        //                         </tr>
        //                     </thead>
        //                     <tbody>
        //                     </tbody>
        //                 </table>
        //             </div>
        //         </div>
        //     `);
        //     const $tbody = $(`#output-${guid} > tbody`);
        //     const statusToBadge = (status) => {
        //         switch (status) {
        //             case 'enqueued':
        //                 return `<span class="badge badge-secondary">Enqueued</span>`;
        //             case 'pending':
        //                 return `<span class="badge badge-warning">Pending</span>`;
        //             case 'complete':
        //                 return `<span class="badge badge-success">Complete</span>`;
        //             case 'failed':
        //                 return `<span class="badge badge-danger">Failed</span>`;
        //         }
        //     };
        //     for (const derivativeType of Object.keys(viewable.derivatives)) {
        //         const derivative = viewable.derivatives[derivativeType];
        //         $tbody.append(`
        //             <tr id="output-${guid}-${derivativeType}">
        //                 <td>${derivativeType}</td>
        //                 <td>${statusToBadge(derivative.status)}</td>
        //                 <td>${derivative.url ? `<a href="${derivative.url}" class="btn btn-sm btn-outline-secondary">Link</a>` : ''}</td>
        //                 <td>${derivative.url ? `<a href="#" data-qr-url="${derivative.url}" class="btn btn-sm btn-outline-secondary">QR</a>` : ''}</td>
        //             </tr>
        //         `);
        //     }
        // }
        // $('a[data-qr-url]').click((ev) => {
        //     const url = $(ev.target).data('qr-url');
        //     $('#qr-modal .modal-body').empty().qrcode({
        //         width: 512,
        //         height: 512,
        //         text: url
        //     });
        //     $('#qr-modal').modal('show');
        // });
        // $preview.append(`<button id="delete-job" class="btn btn-danger">Remove All</button>`);
        // $('#delete-job').click(() => {
        //     fetch(API_HOST + '/api/v1/jobs/' + urn + `?region=${getRegion()}`, {
        //         method: 'DELETE',
        //         headers: { 'Authorization': 'Bearer ' + window.ACCESS_TOKEN }
        //     }).then(() => {
        //         updatePreview(urn, guid);
        //     });
        // });
    } else {
        $preview.append(`
            <div class="alert alert-info">
                No artifacts available.
            </div>
        `);
    }
    $preview.append(`<button id="refresh-job" class="btn btn-secondary">Refresh</button>`);
    $('#refresh-job').click(() => {
        updatePreview(urn, guid);
    });
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
        await fetch(`${API_HOST}/Prod/jobs/${urn}/${guid}?region=${getRegion()}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.ACCESS_TOKEN }
        });
        updatePreview(urn, guid);
    });
}
