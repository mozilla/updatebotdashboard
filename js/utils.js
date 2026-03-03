/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function replaceUrlParam(url, paramName, paramValue) {
  if (paramValue == null) {
    paramValue = '';
  }
  const pattern = new RegExp('\\b(' + paramName + '=).*?(&|#|$)');
  if (url.search(pattern) >= 0) {
    return url.replace(pattern, '$1' + paramValue + '$2');
  }
  url = url.replace(/[?#]$/, '');
  return url + (url.indexOf('?') > 0 ? '&' : '?') + paramName + '=' + paramValue;
}

function updateDomains() {
  // If requested via the json config file, point all queries at
  // a bugzilla test instance.
  let domain = ConfigData.bugzilla_domain;
  if (ConfigData.use_test_domain) {
    domain = ConfigData.bugzilla_test_domain;
  }
  ConfigData.bugzilla_search_url =
    ConfigData.bugzilla_search_url.replace('{domain}', domain);
  ConfigData.bugzilla_put_url =
    ConfigData.bugzilla_put_url.replace('{domain}', domain);
  ConfigData.bugzilla_link_url =
    ConfigData.bugzilla_link_url.replace('{domain}', domain);
  ConfigData.bugzilla_user_url =
    ConfigData.bugzilla_user_url.replace('{domain}', domain);

  console.log("Bugzilla target:", domain);
}

// generate random integer in the given range
function randomNumber(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

function restToQueryUrl(url) {
  // '/rest/bug' | '/buglist.cgi'
  return url.replace('/rest/bug', '/buglist.cgi');
}

function trimAddress(account) {
  if (account == undefined) {
    // Unassigned
    account = '';
  }

  account = account.replace('nobody@mozilla.org', 'nobody');

  // aryx.bugmail@gmx-topmail.de
  account = account.replace('aryx.bugmail@gmx-topmail.de', 'Aryx');
  // ryanvm@gmail.com
  account = account.replace('ryanvm@gmail.com', 'RyanVM');
  // nagbot
  account = account.replace('release-mgmt-account-bot@mozilla.tld', 'nag-bot');
  // updatebot
  account = account.replace('update-bot@bmo.tld', 'update-bot');

  account = account.replace('@mozilla.org', '@moz');
  account = account.replace('@mozilla.com', '@moz');
  return account;
}

function getFromStorage(keyname) {
  let value = sessionStorage.getItem(keyname);
  if (value == null || !value.length) {
    //console.log('session storage value for ', keyname, ' does not exist.');
    value = localStorage.getItem(keyname);
    if (value == null || !value.length) {
      //console.log('persistent storage value for ', keyname, ' does not exist.');
    } else {
      //console.log('persistent storage value for ', keyname, ':', value);
    }
  } else {
    //console.log('session storage value for ', keyname, ':', value);
  }
  return value;
}

function clearStorage(keyname) {
  localStorage.removeItem(keyname);
  sessionStorage.removeItem(keyname);
}

function saveDefaultSortSettings(type, currentOrder) {
  if (ConfigData.saveoptions) {
    localStorage.setItem("sort", type); // string
    localStorage.setItem("sortorder", currentOrder); // boolean
  }
}

function getDefaultSortSettings() {
  return { 'sort': getFromStorage('sort'), 'order': getFromStorage('sortorder') };
}

function loadSettingsInternal() {
  let api_key = getFromStorage("api-key");

  ConfigData.api_key = (api_key == null) ? "" : api_key;
  ConfigData.saveoptions = getFromStorage("save") === 'true';
  ConfigData.targetnew = getFromStorage("target") === 'true';
  ConfigData.incdupes = getFromStorage("incdupes") === 'true';

  console.log('storage key:', ConfigData.api_key);
  console.log("general options:");
  console.log('persist:', ConfigData.saveoptions);
  console.log('targets:', ConfigData.targetnew);
  console.log("display options:");
  console.log('dupes:', ConfigData.incdupes);
}

function openSettings() {
  if (ConfigData.api_key && ConfigData.api_key.length) {
    document.getElementById("api-key").value = ConfigData.api_key;
  }
  document.getElementById("option-save").checked = ConfigData.saveoptions;
  document.getElementById("option-targets").checked = ConfigData.targetnew;
  document.getElementById("option-incdupes").checked = ConfigData.incdupes;

  document.getElementById("popupForm").style.display = "block";
}

function closeSettings() {
  document.getElementById("popupForm").style.display = "none";
}

function saveSettings(e) {
  e.preventDefault();

  const key = document.getElementById("api-key").value;
  const saveChecked = document.getElementById("option-save").checked;
  const targetChecked = document.getElementById("option-targets").checked;
  const incdupesChecked = document.getElementById("option-incdupes").checked;

  // 'remember my settings' checkbox
  let usePersistent = saveChecked;
  console.log('use persistent storage:', usePersistent);

  let storage = usePersistent ? localStorage : sessionStorage;

  clearStorage("api-key");
  storage.setItem("api-key", key);

  clearStorage("save");
  storage.setItem("save", saveChecked ? true : false);

  clearStorage("target");
  storage.setItem("target", targetChecked ? true : false);

  clearStorage("incdupes");
  storage.setItem("incdupes", incdupesChecked ? true : false);

  closeSettings();
  loadSettingsInternal();
  settingsUpdated();
}

/* sorting utilities */

// sorting:
// If the result is negative, a is sorted before b.
// If the result is positive, b is sorted before a.
// If the result is 0, no changes are done with the sort order of the two values.

function sortDateAsc(a, b) {
  return a.date - b.date;
}

function sortDateDesc(a, b) {
  return b.date - a.date;
}

function sortBugIdAsc(a, b) {
  return Number(a.id) - Number(b.id);
}

function sortBugIdDesc(a, b) {
  return Number(b.id) - Number(a.id);
}

// severity - S1 - S4, enhancement, trivial, minor, normal, major, critical, blocker, N/A, --
var sVals = {
  '--': 0,
  'S1': 1,
  'S2': 2,
  'S3': 3,
  'S4': 4,
  'blocker': 1,
  'critical': 1,
  'major': 2,
  'normal': 3,
  'minor': 4,
  'trivial': 4,
  'enhancement': 4,
  'N/A': 4,
};

function sortSeverityAsc(a, b) {
  return sVals[a.severity] - sVals[b.severity];
}

function sortSeverityDesc(a, b) {
  return sVals[b.severity] - sVals[a.severity];
}

var pVals = {
  '--': 0,
  'P1': 1,
  'P2': 2,
  'P3': 3,
  'P4': 4,
  'P5': 5,
};

function sortPriorityAsc(a, b) {
  return pVals[a.priority] - pVals[b.priority];
}

function sortPriorityDesc(a, b) {
  return pVals[b.priority] - pVals[a.priority];
}


