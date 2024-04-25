const APS_CLIENT_ID = '4EYziCb3e6rMT6PYG7sGhPOpmmYxA3yT';
const APS_CALLBACK_URL = window.location.protocol + '//' + window.location.host;
const API_HOST = 'https://m5ey85w3lk.execute-api.us-west-2.amazonaws.com';

window.addEventListener('DOMContentLoaded', async function () {
    const params = new URLSearchParams(window.location.search);
    if (params.has('code')) { // If the URL contains a `code` query parameter, exchange it for an access token
        try {
            const codeVerifier = localStorage.getItem('aps_code_verifier'); // Retrieve code verifier from local storage
            const credentials = await exchangeToken(APS_CLIENT_ID, codeVerifier, params.get('code'), APS_CALLBACK_URL);
            localStorage.setItem('aps_access_token', credentials.access_token);
            localStorage.setItem('aps_access_token_expires_at', Date.now() + credentials.expires_in * 1000);
        } catch (err) {
            console.error(err);
            alert('Login unsuccessful. Please see the console for more details.');
            return;
        }
    }

    // Check if the access token has expired, or schedule an expiration
    const accessToken = localStorage.getItem('aps_access_token');
    const expiresAt = localStorage.getItem('aps_access_token_expires_at');
    if (accessToken) {
        if (expiresAt && parseInt(expiresAt) < Date.now()) {
            localStorage.removeItem('aps_access_token');
            localStorage.removeItem('aps_access_token_expires_at');
        } else {
            setTimeout(function () {
                localStorage.removeItem('aps_access_token');
                localStorage.removeItem('aps_access_token_expires_at');
                window.location.reload();
            }, parseInt(expiresAt) - Date.now());
        }
    }
    window.ACCESS_TOKEN = localStorage.getItem('aps_access_token');

    // Initialize UI depending on the user status
    if (window.ACCESS_TOKEN) {
        $('[data-visibility="logged-in"]').show();
        $('#logout').click(() => {
            localStorage.removeItem('aps_access_token');
            localStorage.removeItem('aps_access_token_expires_at');
            window.location.reload();
        });
        window.bim360Client = new forge.BIM360Client({ token: window.ACCESS_TOKEN });
        window.modelDerivativeClient = new forge.ModelDerivativeClient({ token: window.ACCESS_TOKEN });
        updateHubsDropdown();
    } else {
        $('[data-visibility="logged-out"]').show();
        const codeVerifier = generateRandomString(64); // Length must be between 43 and 128
        localStorage.setItem('aps_code_verifier', codeVerifier); // Store code verifier for later use
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        $('#login').click(() => {
            const url = generateLoginUrl(APS_CLIENT_ID, APS_CALLBACK_URL, ['data:read', 'viewables:read'], '123456', codeChallenge);
            window.location.replace(url);
        });
    }
});

/**
 * Generates random string of specified length.
 * @param {number} len Length of the output string.
 * @param {string} chars Characters allowed in the output string.
 * @returns {string}
 */
function generateRandomString(len, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = chars[Math.floor(Math.random() * chars.length)];
    }
    return arr.join('');
}

/**
 * Generates a PKCE code challenge for given code verifier (see https://aps.autodesk.com/en/docs/oauth/v2/tutorials/code-challenge/).
 * @async
 * @param {string} codeVerifier Code verifier.
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(codeVerifier) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    return window.btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generates URL for initiating the PKCE authorization workflow (see https://aps.autodesk.com/en/docs/oauth/v2/tutorials/get-3-legged-token-pkce/#step-1-direct-the-user-to-the-authorization-web-flow-with-pkce).
 * @param {string} clientId Application client ID.
 * @param {string} callbackUrl Callback URL as configured on the dev. portal.
 * @param {array} scopes List of authentication scopes (see https://aps.autodesk.com/en/docs/oauth/v2/developers_guide/scopes/).
 * @param {string} nonce Arbitrary string used to associate a client session with an ID token and to mitigate replay attacks.
 * @param {string} challenge Code challenge generated from code verifier (see `generateCodeChallenge`).
 * @returns {string}
 */
function generateLoginUrl(clientId, callbackUrl, scopes, nonce, challenge) {
    const url = new URL('https://developer.api.autodesk.com/authentication/v2/authorize');
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('client_id', clientId);
    url.searchParams.append('redirect_uri', callbackUrl);
    url.searchParams.append('scope', scopes.join(' '));
    url.searchParams.append('nonce', nonce);
    url.searchParams.append('prompt', 'login');
    url.searchParams.append('code_challenge', challenge);
    url.searchParams.append('code_challenge_method', 'S256');
    return url.toString();
}

/**
 * Exchanges temporary code from the PKCE authorization workflow for access token.
 * See https://aps.autodesk.com/en/docs/oauth/v2/tutorials/get-3-legged-token-pkce/#step-3-exchange-the-authorization-code-with-pkce-for-an-access-token.
 * @async
 * @param {string} clientId Application client ID.
 * @param {string} codeVerifier PKCE code verifier.
 * @param {string} code Temporary code received from the PKCE authorization workflow.
 * @param {string} callbackUrl Callback URL as configured on the dev. portal.
 * @returns {Promise<object>}
 */
async function exchangeToken(clientId, codeVerifier, code, callbackUrl) {
    const payload = {
        'grant_type': 'authorization_code',
        'client_id': clientId,
        'code_verifier': codeVerifier,
        'code': code,
        'redirect_uri': callbackUrl
    };
    const resp = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: Object.keys(payload).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(payload[key])).join('&')
    });
    if (!resp.ok) {
        throw new Error(await resp.text());
    }
    const credentials = await resp.json();
    return credentials;
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
                            ${urls['GlbDraco'] ? `<div class="card-img-top"><model-viewer class="model-preview" src="${urls['GlbDraco']}" alt="glb preview" auto-rotate camera-controls ar ar-modes="webxr scene-viewer quick-look fallback" ar-scale="auto"></model-viewer></div>` : ''}
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
                                        ${Object.keys(urls).map(artifactType => {
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
