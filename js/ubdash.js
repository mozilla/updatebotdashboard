/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
  - Settings support and api keys

*/
 
$(document).ready(function () {
  loadConfig();
});

function loadConfig() {
  $.getJSON("config.json", function (configData) {
    loadPage(configData);
  }).fail(function () {
    console.log("getJSON call failed for some reason.")
  });
}

function prepPage() {
  $("#report-open").empty();
  $("#report-closed").empty();
  checkConfig();
}

var ConfigData = {};

function loadPage(configData)
{
  ConfigData = configData.config;
  updateDomains();
  loadSettingsInternal();

  $("#errors").empty();

  prepPage();
  prepData();

  let url = ConfigData.bugzilla_search_url;

  if (ConfigData.api_key.length) {
    url += "api_key=" + ConfigData.api_key + "&";
  }

  // Open bugs filed by update bot - 
  let query = "f1=reporter&o1=equals&v1=update-bot%40bmo.tld&classification=Client%20Software&classification=Developer%20Infrastructure&classification=Components&classification=Server%20Software&classification=Other&resolution=---&&include_fields=id,summary,assigned_to";

  retrieveInfoFor(url + query, 'open');

  // Fixed bugs filed by update bot. Note this
  // ignores other resolved types like duplicates and invalids.
  query = "resolution=FIXED&f1=reporter&chfield=cf_last_resolved&v1=update-bot%40bmo.tld&classification=Client%20Software&classification=Developer%20Infrastructure&classification=Components&classification=Server%20Software&classification=Other&o1=equals&&include_fields=id,summary,assigned_to";
  retrieveInfoFor(url + query, 'closed');
}

var LastErrorText = "";
function errorMsg(text) {
  if (LastErrorText == text)
    return;
  $("#errors").append(text);
  LastErrorText = text;
}

function retrieveInfoFor(url, userQuery) {
  $.ajax({
    url: url,
    success: function (data) {
      processListFor(userQuery, data);
    }
  })
  .error(function(jqXHR, textStatus, errorThrown) {
    console.log("status:", textStatus);
    console.log("error thrown:", errorThrown);
    console.log("response text:", jqXHR.responseText);
    try {
      let info = JSON.parse(jqXHR.responseText);
      let text = info.message ? info.message : errorThrown;
      errorMsg(text);
      return;
    } catch(e) {
    }
    errorMsg(errorThrown);
  });
}

var RegExpSummaryPattern1 = new RegExp('Update (.*) to new version (.*) from (.*)');
var RegExpSummaryPattern2 = new RegExp('Update (.*) to new version (.*) for .*');

function parseBugSummary(bugid, summary, assignee) {
  // Update libjxl to new version 5853ad97044c3b9da46d10b611e66063b1297cc5 from 2022-12-22 12:47:29
  // Examine angle for 2 new commits, culminating in 92b793976c27682baaac6ea07f56d079b837876c (2021-10-12 23:36:02 +0000)
  // Update dav1d to new version ddbbfde for Firefox 91
  let results = RegExpSummaryPattern1.exec(summary);
  if (results == null) {
    results = RegExpSummaryPattern2.exec(summary);
  }

  if (results == null) {
    console.log('Error parsing bug', bugid, 'summary:');
    console.log(summary);
    return null;
  }

  return {
    'rev': results[2],
    'date': new Date(results[3]),
    'lib': results[1],
    'id': bugid.toString(),
    'assignee': trimAddress(assignee)
  };
}

function prepEntryHeader(category, type) {
  let header = 
    "<div class='listhdr-date'>Date</div>" + 
    "<div class='listhdr-library'>Library</div>" + 
    "<div class='listhdr-bugid'>Bug</div>" + 
    "<div class='listhdr-status'>Changeset</div>" +
    "<div class='listhdr-assignee'>Owner</div>";

  let id = "list-" + type + category;
  let subid = "sublist-" + type + category;

  let body = 
  "<div class='list-container' id='" + id + "'>" +
  "<div class='sublist-title'>" + category + "</div>" +
  "<div class='sublist-library'>" +
  "<div class='sublist-items' id='" + subid + "'></div>" +
  "</div></div>";

  $("#report-" + type).append(body);
  $("#" + subid).append(header);
}

function prepEntry(elId, lib, dt, bugid, status, assignee) {
  const options = { dateStyle: 'medium' };
  let dateStr = dt.toLocaleDateString(undefined, options);
  let tabTarget = ConfigData.targetnew ? "nidetails" : "_blank";
  let bugUrl = ConfigData.bugzilla_link_url.replace('{id}', bugid);
  let bugLink = "<a target='" + tabTarget + "' href='" + bugUrl + "'>" + bugid + "</a>";

  let entry = 
    "<div class='listitem-date'>" + dateStr + "</div>" + 
    "<div class='listitem-library'>" + lib + "</div>" + 
    "<div class='listitem-bugid'>" + bugLink + "</div>" + 
    "<div class='listitem-status'>" + status + "</div>" +
    "<div class='listitem-assignee'>" + assignee + "</div>";

  $('#' + elId).append(entry);
}

var OpenBugList = [];
var ClosedBugList = [];

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
    break;
    case 'closed':
      return ClosedBugList;
    break;
  }
}

function processListFor(type, data) {
  let list = getList(type);
  data.bugs.forEach(function (bug) {
    // date, lib, rev, id 
    let res = parseBugSummary(bug.id, bug.summary, bug.assigned_to);
    if (res == null) {
      return;
    }

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

function displayListFor(type)
{
  let list = getList(type);

  // Categories
  for (const [key, value] of Object.entries(list)) {
    // sort by date
    value.list.sort(sortDateAsc);
    value.list.forEach(function (bug) {
      prepEntry(value.sublistId, bug.lib, bug.date, bug.id, bug.rev, bug.assignee);
      let el = document.getElementById(value.listId);
      el.style.visibility = 'visible';
    });
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
  if (!ConfigData.api_key || ConfigData.api_key.length == 0) {
    document.getElementById('alert-icon').style.visibility = 'visible';
  } else {
    document.getElementById('alert-icon').style.visibility = 'hidden';
  }
}
