/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const COLLAPSED_COUNT = 3;

const CLASSIFICATIONS = [
  "Client Software", "Developer Infrastructure",
  "Components", "Server Software", "Other"
];
const INCLUDE_FIELDS = "id,summary,assigned_to,creation_time,resolution";
const REPORTER = "update-bot@bmo.tld";

function baseParams() {
  const p = new URLSearchParams();
  p.append("f1", "reporter");
  p.append("o1", "equals");
  p.append("v1", REPORTER);
  for (const c of CLASSIFICATIONS) p.append("classification", c);
  p.append("include_fields", INCLUDE_FIELDS);
  return p;
}

let OpenBugList = [];
let ClosedBugList = [];
let ConfigData = {};

document.addEventListener('DOMContentLoaded', loadConfig);

function loadConfig() {
  fetch("config.json")
    .then(r => r.json())
    .then(configData => loadPage(configData))
    .catch(function () {
      console.log("fetch call failed for some reason.");
    });
}

function prepPage() {
  document.getElementById("report-open").innerHTML = '';
  document.getElementById("report-closed").innerHTML = '';
  checkConfig();
}

function loadPage(configData) {
  ConfigData = configData.config;
  updateDomains();
  loadSettingsInternal();

  document.getElementById("errors").innerHTML = '';

  prepPage();
  prepData();

  const url = ConfigData.bugzilla_search_url;

  // Open bugs filed by update bot.
  const openParams = baseParams();
  openParams.append("resolution", "---");
  retrieveInfoFor(`${url}${openParams}`, 'open');

  // Closed bugs filed by update bot.
  const closedParams = baseParams();
  closedParams.append("resolution", "FIXED");
  if (ConfigData.incdupes) {
    // Add duplicates if settings dictates displaying them.
    closedParams.append("resolution", "DUPLICATE");
  }
  closedParams.append("chfield", "cf_last_resolved");
  retrieveInfoFor(`${url}${closedParams}`, 'closed');
}

let lastErrorText = "";
function errorMsg(text) {
  if (lastErrorText == text)
    return;
  document.getElementById("errors").insertAdjacentHTML('beforeend', text + '<br>');
  lastErrorText = text;
}

function retrieveInfoFor(url, userQuery) {
  const fetchOptions = {};
  if (ConfigData.api_key && ConfigData.api_key.length) {
    fetchOptions.headers = { "X-Bugzilla-api-key": ConfigData.api_key };
  }
  fetch(url, fetchOptions)
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        errorMsg(data.message || 'Request failed');
        return;
      }
      processListFor(userQuery, data);
    })
    .catch(function(error) {
      console.log("error:", error);
      errorMsg(error.message || error.toString());
    });
}

// Handles all three "Update" variants:
//   "Update libjxl to new version abc123 from 2022-12-22 12:47:29"
//   "Update dav1d to new version ddbbfde for Firefox 91"
//   "Update dav1d to new version ddbbfde"
const RegExpUpdate = /^Update (?<lib>.+?) to new version (?<rev>\S+)(?:\s+from\s+(?<date>\S+\s+\S+))?/;

// Examine angle for 2 new commits, culminating in 92b793976c27682baaac6ea07f56d079b837876c (2021-10-12 23:36:02 +0000)
const RegExpExamine = /^Examine (?<lib>.+?) for \d+ new commits?, culminating in (?<rev>[a-z0-9]+)\s+(?<date>\d{4}-\d{2}-\d{2})/;

function parseBugSummary(bugid, summary, assignee, creation_time, resolution) {
  let data = {
    rev: 'unknown',
    date: new Date(creation_time),
    lib: 'unknown',
    id: bugid.toString(),
    resolution,
    assignee: trimAddress(assignee)
  };

  summary = summary.replace(/[()]/g, '');

  let m = RegExpUpdate.exec(summary);
  if (m) {
    data.lib = m.groups.lib;
    data.rev = m.groups.rev;
    if (m.groups.date) data.date = new Date(m.groups.date);
    return data;
  }

  m = RegExpExamine.exec(summary);
  if (m) {
    data.lib = m.groups.lib;
    data.rev = m.groups.rev;
    data.date = new Date(m.groups.date);
    return data;
  }

  errorMsg('Error parsing bug ' + bugid + ' summary: ' + summary);
  return null;
}

/*
  <div id='report-open' class='table-container'>
    <div class="list-container" id="list-openImage" style="visibility: visible;">
      <div class="sublist-title">Image</div>
      <div class="sublist-library">
        <div class="sublist-items" id="sublist-openImage">
          <div class="listhdr-date">Date</div>
          <div class="listhdr-library">Library</div>
          <div class="listhdr-bugid">Bug</div>
          <div class="listhdr-change">Changeset</div>
          <div class="listhdr-assignee">Owner</div>
          <div class="listitem-date">Dec 19, 2022</div>
          <div class="listitem-library">libwebp</div>
          <div class="listitem-bugid">
          <a target="_blank" href="https://bugzilla.mozilla.org/show_bug.cgi?id=1810078">1810078</a></div>
          <div class="listitem-change">v1.3.0</div>
          <div class="listitem-assignee">aosmond@moz</div>
        </div>
      </div>
    </div>
  </div>
*/


function prepEntryHeader(category, type) {
  let header =
    "<div class='listhdr-date'>Date</div>" +
    "<div class='listhdr-library'>Library</div>" +
    "<div class='listhdr-bugid'>Bug</div>" +
    "<div class='listhdr-change'>Changeset</div>" +
    "<div class='listhdr-assignee'>Owner</div>";

  if (type == 'closed' && ConfigData.incdupes) {
    header += "<div class='listhdr-resolution'>Resolution</div>";
  }

  let id = "list-" + type + category;
  let subid = "sublist-" + type + category;

  let body =
  "<div class='list-container' id='" + id + "'>" +
  "<div class='sublist-title'>" + category + "</div>" +
  "<div class='sublist-library'>";

  if (type == 'open' || !ConfigData.incdupes) {
    body += "<div class='sublist-items' id='" + subid + "'></div>" +
            "</div></div>";
  } else {
    body += "<div class='sublist-items-closed' id='" + subid + "'></div>" +
            "</div></div>";
  }

  document.getElementById("report-" + type).insertAdjacentHTML('beforeend', body);
  document.getElementById(subid).insertAdjacentHTML('beforeend', header);
}

function prepEntry(type, elId, lib, dt, bugid, changeset, assignee, resolution, isExtra = false) {
  const options = { dateStyle: 'medium' };
  let dateStr = dt.toLocaleDateString(undefined, options);
  let tabTarget = ConfigData.targetnew ? "nidetails" : "_blank";
  let bugUrl = ConfigData.bugzilla_link_url.replace('{id}', bugid);
  let bugLink = "<a target='" + tabTarget + "' href='" + bugUrl + "'>" + bugid + "</a>";

  let cells =
    "<div class='listitem-date'>" + dateStr + "</div>" +
    "<div class='listitem-library'>" + lib + "</div>" +
    "<div class='listitem-bugid'>" + bugLink + "</div>" +
    "<div class='listitem-change'>" + changeset + "</div>" +
    "<div class='listitem-assignee'>" + assignee + "</div>";

  if (type == 'closed' && ConfigData.incdupes) {
    cells += "<div class='listitem-resolution'>" + resolution + "</div>";
  }

  let entry;
  if (isExtra) {
    entry = "<div class='extra-row' style='display: none'>" + cells + "</div>";
  } else {
    entry = "<div class='listitem-row' style='display: contents'>" + cells + "</div>";
  }

  document.getElementById(elId).insertAdjacentHTML('beforeend', entry);
}

function insertExpandButton(sublistId) {
  let html = "<div class='expand-row' style='grid-column: 1 / -1; text-align: center; padding: 5px;'>" +
    "<button class='expand-collapse-btn' onclick=\"expandSection('" + sublistId + "')\">&#9660; Show more</button>" +
    "</div>";
  document.getElementById(sublistId).insertAdjacentHTML('beforeend', html);
}

function insertCollapseButton(sublistId) {
  let html = "<div class='collapse-row' style='grid-column: 1 / -1; text-align: center; padding: 5px; display: none;'>" +
    "<button class='expand-collapse-btn' onclick=\"collapseSection('" + sublistId + "')\">&#9650; Show less</button>" +
    "</div>";
  document.getElementById(sublistId).insertAdjacentHTML('beforeend', html);
}

function expandSection(sublistId) {
  let sublist = document.getElementById(sublistId);
  sublist.querySelectorAll('.extra-row').forEach(el => el.style.display = 'contents');
  sublist.querySelector('.expand-row').style.display = 'none';
  sublist.querySelector('.collapse-row').style.display = '';
}

function collapseSection(sublistId) {
  let sublist = document.getElementById(sublistId);
  sublist.querySelectorAll('.extra-row').forEach(el => el.style.display = 'none');
  sublist.querySelector('.expand-row').style.display = '';
  sublist.querySelector('.collapse-row').style.display = 'none';
}

function prepData() {
  for (const [key, value] of Object.entries(ConfigData.categories)) {
    let category = key.toString();
    OpenBugList[category] = {
      'listId': "list-open" + category,
      'sublistId': "sublist-open" + category,
      'list': []
    };
    ClosedBugList[category] = {
      'listId': "list-closed" + category,
      'sublistId': "sublist-closed" + category,
      'list': []
    };
  }
}

function getList(type) {
  switch(type) {
    case 'open':
      return OpenBugList;
    case 'closed':
      return ClosedBugList;
  }
}

function processListFor(type, data) {
  let list = getList(type);
  data.bugs.forEach(function (bug) {
    // Returns a js object containing all the bug's info we display.
    let res = parseBugSummary(bug.id, bug.summary, bug.assigned_to, bug.creation_time, bug.resolution);
    if (res == null) {
      return;
    }

    // Group by the categories we have in the config.json file.
    let found = false;
    for (const [key, value] of Object.entries(ConfigData.categories)) {
      if (value.includes(res.lib)) {
        list[key.toString()].list.push(res);
        found = true;
        break;
      }
    }
    if (!found) {
      list['Misc'].list.push(res);
    }
  });

  // Prep our html tables based on the incoming data
  for (const [key, value] of Object.entries(list)) {
    if (value.list.length > 0) {
      prepEntryHeader(key, type);
    }
  }

  displayListFor(type);
}

function displayListFor(type) {
  let list = getList(type);

  for (const [key, value] of Object.entries(list)) {
    value.list.sort(sortDateDesc);

    if (type === 'closed' && value.list.length > COLLAPSED_COUNT) {
      for (let i = 0; i < COLLAPSED_COUNT; i++) {
        let bug = value.list[i];
        prepEntry(type, value.sublistId, bug.lib, bug.date, bug.id, bug.rev, bug.assignee, bug.resolution, false);
      }
      insertExpandButton(value.sublistId);
      for (let i = COLLAPSED_COUNT; i < value.list.length; i++) {
        let bug = value.list[i];
        prepEntry(type, value.sublistId, bug.lib, bug.date, bug.id, bug.rev, bug.assignee, bug.resolution, true);
      }
      insertCollapseButton(value.sublistId);
    } else {
      value.list.forEach(function (bug) {
        prepEntry(type, value.sublistId, bug.lib, bug.date, bug.id, bug.rev, bug.assignee, bug.resolution, false);
      });
    }

    if (value.list.length > 0) {
      document.getElementById(value.listId).style.visibility = 'visible';
    }
  }
}

function refreshList(e) {
  if (e) {
    e.preventDefault();
  }
  loadConfig();
}

function settingsUpdated() {
  checkConfig();
  refreshList(null);
}

function checkConfig() {
  // Throw up a little red ! if we don't have a bugzilla api key configued.
  if (!ConfigData.api_key || ConfigData.api_key.length == 0) {
    document.getElementById('alert-icon').style.visibility = 'visible';
  } else {
    document.getElementById('alert-icon').style.visibility = 'hidden';
  }
}
