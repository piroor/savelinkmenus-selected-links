const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import('resource://gre/modules/Services.jsm');

let DEBUG = false;  // If false, the log() function does nothing.

//===========================================
// SaveLinkMenus
//===========================================
let SaveLinkMenus = {
    _branch: null,
    _menuIds: {},
    _contextMenuIds: {},

    install: function() {
        log('install()');
    },

    uninstall: function() {
        log('uninstall()');
    },

    setupDefaultPrefs: function() {
        log('setupDefaultPrefs()');
        
        let branch = Services.prefs.getDefaultBranch('extensions.savelinkmenus.');
        branch.setBoolPref('savepage.enabled', true);
        branch.setBoolPref('savelink.enabled', true);
    },

    init: function() {
        log('init()');

        this.setupDefaultPrefs();

        if (!this._branch) {
            this._branch = Services.prefs.getBranch('extensions.savelinkmenus.');
            this._branch.addObserver('', this, false);
        }
    },

    uninit: function() {
        log('uninit()');
    
        if (this._branch) {
            this._branch.removeObserver('', this);
            this._branch = null;
        }
    },

    load: function(aWindow) {
        log('load(' + aWindow + ')');

        if (!aWindow)
            return;

        // Create UI
        this.setupUI(aWindow);
    },

    unload: function(aWindow) {
        log('unload(' + aWindow + ')');

        if (!aWindow)
            return;

        // Clean up the UI
        this.cleanupUI(aWindow);
    },

    setupUI: function(aWindow) {
        log('setupUI(' + aWindow + ')');
    
        let self = this;
        let menu = aWindow.NativeWindow.menu;
        let contextmenus = aWindow.NativeWindow.contextmenus;

        if (this._branch.getBoolPref('savepage.enabled')) {
            this._menuIds['SavePage'] = menu.add(
                    tr('SavePageMenu'),
                    null,
                    function() {
                        let selectedTab = aWindow.BrowserApp.selectedTab;
                        let document = selectedTab.window.document;
                        let uri = selectedTab.browser.currentURI;

                        if (!self._checkURI(aWindow, uri, document.nodePrincipal)) {
                            showToast(aWindow, tr('FailedMessage'));
                            return;
                        }

                        // Confirm dialog with checkbox
                        let complete = {value: true};
                        let ok = Services.prompt.confirmCheck(null,
                                        tr('SavePageDialogTitle'),
                                        null,
                                        tr('SavePageDialogComplete'),
                                        complete);

                        if (ok) {
                            if (complete.value)
                                aWindow.ContentAreaUtils.saveDocument(document, true);    
                            else
                                self._saveURI(aWindow, null);
                        }
                    }
            );
        }

        if (this._branch.getBoolPref('savelink.enabled')) {
            this._contextMenuIds['SaveLink'] = contextmenus.add(
                    tr('SaveLinkMenu'),
                    contextmenus.linkOpenableContext,
                    function(aElement) {
                        let url = contextmenus._getLinkURL(aElement);
                        let uri = Services.io.newURI(url, null, null);

                        if (!self._checkURI(aWindow, uri, aElement.nodePrincipal)) {
                            showToast(aWindow, tr('FailedMessage'));
                            return;
                        }

                        self._saveURI(aWindow, uri);
                    }
            );
        }
    },

    cleanupUI: function(aWindow) {
        log('cleanupUI(' + aWindow + ')');

        for (let k in this._menuIds) {
            let id = this._menuIds[k];
            aWindow.NativeWindow.menu.remove(id);
        }

        for (let k in this._contextMenuIds) {
            let id = this._contextMenuIds[k];
            aWindow.NativeWindow.contextmenus.remove(id);
        }

        this._menuIds = {};
        this._contextMenuIds = {};
    },

    observe: function(aSubject, aTopic, aData) {
        log('observe(' + aSubject + ', ' + aTopic + ', ' + aData + ')');

        switch (aData) {
            case 'savepage.enabled':
            case 'savelink.enabled':
                let windows = Services.wm.getEnumerator('navigator:browser');
                while (windows.hasMoreElements()) {
                    let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
                    if (win) {
                        this.cleanupUI(win);
                        this.setupUI(win);
                    }
                }
                break;
        }
    },

    _checkURI: function(aWindow, aURI, aPrincipal) {
        log('_checkURI(' + aWindow + ', ' + aURI + ', ' + aPrincipal + ')');

        if (!aURI.scheme.match(/http|https/))
            return false;

        try {
            aWindow.ContentAreaUtils.urlSecurityCheck(aURI, aPrincipal);
            return true;
        } catch (ex) {
            log('urlScurityCheck() throw: ' + ex);
            return false;
        }
    },

    _saveURI: function(aWindow, aSourceURI) {
        log('_saveURI(' + aWindow + ', ' + aSourceURI + ')');

        // Detect content-type
        if (aSourceURI) {
            let req = Cc['@mozilla.org/xmlextras/xmlhttprequest;1']
                                .createInstance(Ci.nsIXMLHttpRequest);
            let self = this;
            req.open('HEAD', aSourceURI.spec, true);
            req.onreadystatechange = function(aEvent) {
                if (req.readyState == 4) {
                    if (req.status == 200) {
                        // If here the contentType is invalid,
                        // the mimeInfo will be null in _saveURIWithContentType().
                        //
                        let contentType = req.getResponseHeader('Content-Type');
                        if (contentType)
                            contentType = contentType.match('^[^;]+');

                        //log('contentType: ' + contentType.toString());
                        //log('headers: ' + req.getAllResponseHeaders());

                        self._saveURIWithContentType(aWindow, aSourceURI, contentType);
                    } else {
                        log('HEAD request failed: ' + req.status);
                        showToast(aWindow, tr('FailedMessage'));
                    }
                }
            };
            req.send(null);

        } else {
            let selectedTab = aWindow.BrowserApp.selectedTab;
            let contentType = selectedTab.window.document.contentType;
            aSourceURI = selectedTab.browser.currentURI;
            if (contentType)
                contentType = contentType.match('^[^;]+');

            this._saveURIWithContentType(aWindow, aSourceURI, contentType);
        }
    },

    _saveURIWithContentType: function(aWindow, aSourceURI, aContentType) {
        log('_saveURIWithContentType(' + aWindow + ', ' + aSourceURI + ', ' + aContentType + ')');

        let selectedTab = aWindow.BrowserApp.selectedTab;
        let title = doc = null;

        let ext, mimeInfo;
        try {
            // Throw an exception if the aContentType is incorrect.
            let mimeSrv = Cc['@mozilla.org/mime;1'].getService(Ci.nsIMIMEService);
            mimeInfo = mimeSrv.getFromTypeAndExtension(aContentType, '');
            if (mimeInfo)
                ext = mimeInfo.primaryExtension;
        } catch (ex) {
            log('Warning: mimeInfo is null');
            ext = '';
            mimeInfo = null;
        }

        let caUtils = aWindow.ContentAreaUtils;
        let fileName = caUtils.getDefaultFileName(title, aSourceURI, doc, null);

        fileName = caUtils.getNormalizedLeafName(fileName.trim(), ext);
        log('fileName: ' + fileName);

        // Show progress in the Download Manager
        let dm = Services.downloads;
        let downloadDir = dm.defaultDownloadsDirectory;
        let file = downloadDir.clone();
        file.append(fileName);
        file.createUnique(file.NORMAL_FILE_TYPE, parseInt('666', 8));
        let destURI = Services.io.newFileURI(file);

        let cancelable = { cancel: function(aReason) {}, };
        
        let isPrivate = false;
        if (aWindow.PrivateBrowsingUtils) { // From Firefox 20
            isPrivate = aWindow.PrivateBrowsingUtils.isWindowPrivate(
                                            selectedTab.browser.contentWindow);
        }

        let download = dm.addDownload(Ci.nsIDownloadManager.DOWNLOAD_TYPE_DOWNLOAD,
                                     aSourceURI,
                                     destURI,
                                     fileName,
                                     mimeInfo,
                                     Date.now() * 1000,
                                     null,                // nsIFile aTempFile
                                     cancelable,
                                     isPrivate);

        // Make WebBrowserPersist
        const nsIWBP = Ci.nsIWebBrowserPersist;
        const wbp_flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
        let wbp = Cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
                                    .createInstance(Ci.nsIWebBrowserPersist);

        wbp.persistFlags = wbp_flags | nsIWBP.PERSIST_FLAGS_FROM_CACHE;
        wbp.progressListener = download;
     
        let privacyContext = selectedTab.window.QueryInterface(Ci.nsIInterfaceRequestor)
                                               .getInterface(Ci.nsIWebNavigation)
                                               .QueryInterface(Ci.nsILoadContext);

        wbp.saveURI(aSourceURI, null, null, null, null, destURI, privacyContext);
    },
};

//===========================================
// bootstrap.js API
//===========================================
function install(aData, aReason) {
    SaveLinkMenus.install();
}

function uninstall(aData, aReason) {
    if (aReason == ADDON_UNINSTALL)
        SaveLinkMenus.uninstall();
}

function startup(aData, aReason) {
    // General setup
    SaveLinkMenus.init();

    // Load into any existing windows
    let windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
        let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (win)
            SaveLinkMenus.load(win);
    }

    // Load into any new windows
    Services.wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
    // When the application is shutting down we normally don't have to clean
    // up any UI changes made
    if (aReason == APP_SHUTDOWN)
        return;

    // Stop listening for new windows
    Services.wm.removeListener(windowListener);

    // Unload from any existing windows
    let windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
        let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (win)
            SaveLinkMenus.unload(win);
    }

    // General teardown
    SaveLinkMenus.uninit();
}

let windowListener = {
    onOpenWindow: function(aWindow) {
        let win = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindowInternal
                                                || Ci.nsIDOMWindow);

        win.addEventListener('UIReady', function() {
            win.removeEventListener('UIReady', arguments.callee, false);
            SaveLinkMenus.load(win);
        }, false);
    },

    // Unused
    onCloseWindow: function(aWindow) {},
    onWindowTitleChange: function(aWindow, aTitle) {},
};


//===========================================
// Utilities
//===========================================
function log(aMsg) {
    if (!DEBUG)
        return;
    aMsg = 'SaveLinkMenus: ' + aMsg;
    Services.console.logStringMessage(aMsg);
}

function showToast(aWindow, aMsg, aDuration) {
    aWindow.NativeWindow.toast.show(aMsg, aDuration || 'short');
}

let gStringBundle = null;

function tr(aName) {
    // For translation
    if (!gStringBundle) {
        let uri = 'chrome://savelinkmenus/locale/main.properties';
        gStringBundle = Services.strings.createBundle(uri);
    }

    try {
        return gStringBundle.GetStringFromName(aName);
    } catch (ex) {
        return aName;
    }
}

