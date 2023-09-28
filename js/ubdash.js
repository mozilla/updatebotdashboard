/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
  Todo:
   - collapsable category sections in closed bugs list
*/

var OpenBugList = [];
var ClosedBugList = [];
var ConfigData = {};

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

function loadPage(configData) {
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
  // 
  // Open bugs filed by update bot - 
  let query = "resolution=---&f1=reporter&o1=equals&v1=update-bot%40bmo.tld&classification=Client%20Software&classification=Developer%20Infrastructure&classification=Components&classification=Server%20Software&classification=Other";
  query += "&include_fields=id,summary,assigned_to,creation_time,resolution";

  retrieveInfoFor(url + query, 'open');

  // 'Fixed' bugs filed by update bot.
  query = "resolution=FIXED&";
  if (ConfigData.incdupes) {
    // Add duplicates if settings dictates displaying them.
    query += "resolution=DUPLICATE&";
  }

  query += "&f1=reporter&chfield=cf_last_resolved&v1=update-bot%40bmo.tld&classification=Client%20Software&classification=Developer%20Infrastructure&classification=Components&classification=Server%20Software&classification=Other&o1=equals";
  query += "&include_fields=id,summary,assigned_to,creation_time,resolution";
  retrieveInfoFor(url + query, 'closed');
}

var LastErrorText = "";
function errorMsg(text) {
  if (LastErrorText == text)
    return;
  $("#errors").append(text);
  $("#errors").append(' | ');
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

// Update libjxl to new version 5853ad97044c3b9da46d10b611e66063b1297cc5 from 2022-12-22 12:47:29
var RegExpSummaryPattern1 = new RegExp('Update (.*) to new version (.*) from (.*)');

// Update dav1d to new version ddbbfde for Firefox 91
var RegExpSummaryPattern2 = new RegExp('Update (.*) to new version (.*) for .*');

// Examine angle for 2 new commits, culminating in 92b793976c27682baaac6ea07f56d079b837876c (2021-10-12 23:36:02 +0000)
var RegExpSummaryPattern3 = new RegExp('Examine (.*) for [0-9]+ new commits, culminating in ([a-z0-9]+) ([0-9-]+)');

// Update dav1d to new version ddbbfde for Firefox 91
var RegExpSummaryPattern4 = new RegExp('Update (.*) to new version (.*)');

function parseBugSummary(bugid, summary, assignee, creation_time, resolution) {
  let data = {
    'rev': 'unknown',
    'date': new Date(creation_time),
    'lib': 'unknown',
    'id': bugid.toString(),
    'resolution': resolution,
    'assignee': trimAddress(assignee)
  };

  // bleh
  summary = summary.replace('(', '');
  summary = summary.replace(')', '');

  let results = RegExpSummaryPattern1.exec(summary);
  if (results != null) {
    data.lib = results[1];
    data.rev = results[2];
    data.date = new Date(results[3]);
    return data;
  }

  results = RegExpSummaryPattern2.exec(summary);
  if (results != null) {
    data.lib = results[1];
    data.rev = results[2];
    return data;
  }

  results = RegExpSummaryPattern3.exec(summary);
  if (results != null) {
    data.lib = results[1];
    data.rev = results[2];
    data.date = new Date(results[3]);
    return data;
  }

  results = RegExpSummaryPattern4.exec(summary);
  if (results != null) {
    data.lib = results[1];
    data.rev = results[2];
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

  $("#report-" + type).append(body);
  $("#" + subid).append(header);
}

function prepEntry(type, elId, lib, dt, bugid, changeset, assignee, resolution) {
  const options = { dateStyle: 'medium' };
  let dateStr = dt.toLocaleDateString(undefined, options);
  let tabTarget = ConfigData.targetnew ? "nidetails" : "_blank";
  let bugUrl = ConfigData.bugzilla_link_url.replace('{id}', bugid);
  let bugLink = "<a target='" + tabTarget + "' href='" + bugUrl + "'>" + bugid + "</a>";

  let entry = 
    "<div class='listitem-date'>" + dateStr + "</div>" + 
    "<div class='listitem-library'>" + lib + "</div>" + 
    "<div class='listitem-bugid'>" + bugLink + "</div>" + 
    "<div class='listitem-change'>" + changeset + "</div>" +
    "<div class='listitem-assignee'>" + assignee + "</div>";

  if (type == 'closed' && ConfigData.incdupes) {
    entry += "<div class='listitem-resolution'>" + resolution + "</div>";
  }

  $('#' + elId).append(entry);
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
    break;
    case 'closed':
      return ClosedBugList;
    break;
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

  // Categories
  for (const [key, value] of Object.entries(list)) {
    // sort by date
    value.list.sort(sortDateAsc);
    value.list.forEach(function (bug) {
      prepEntry(type, value.sublistId, bug.lib, bug.date, bug.id, bug.rev, bug.assignee, bug.resolution);
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
  // Throw up a little red ! if we don't have a bugzilla api key configued.
  if (!ConfigData.api_key || ConfigData.api_key.length == 0) {
    document.getElementById('alert-icon').style.visibility = 'visible';
  } else {
    document.getElementById('alert-icon').style.visibility = 'hidden';
  }
}
