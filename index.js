const notionToken = "secret_xxxxxxxxxx";
const notionDbId = "xxxxxxxxxx";
const calendarId = "xxxxxxxx@group.calendar.google.com";

const notionPrefix = "https://www.notion.so/";

const nameProp = "Name";
const dateProp = "Date";
const hoursProp = "Hours";
const statusProp = "Status";
const eventIdProp = "eventId";

const completedStatus = "Completed";

const daysForSearch = 30;

const isLogging = true;

function main() {
  let lastUpdateKey = "lastUpdate";
  let propertiesService = PropertiesService.getUserProperties();
  let lastUpdate = new Date(propertiesService.getProperties()[lastUpdateKey]);
  lastUpdate = lastUpdate.setMinutes(lastUpdate.getMinutes() - 1);

  let json = fetchNotion(lastUpdate);

  json.results = json.results.sort((a, b) => a.last_edited_time > b.last_edited_time ? -1 : 1);
  propertiesService.setProperty(lastUpdateKey, json.results[0].last_edited_time);

  json.results
    .forEach((page) => {
      // dump(page);
      if (new Date(page.last_edited_time) > lastUpdate &&
        isValidPage(page)) {
        addCalendar(page);
      }
    });
}

function dump(page) {
  console.log(page);
}


function addDate(date, value) {
  return new Date(date.setDate(date.getDate() + value));
}

function isValidPage(page) {
  return (
    nameProp in page.properties &&
    dateProp in page.properties
  );
}

function getEvent(calendar, props) {
  let eventId = getRichText(props[eventIdProp]);
  let event = calendar.getEventById(eventId);
  return event;
}


function addCalendar(page) {
  let calendar = CalendarApp.getCalendarById(calendarId);

  let props = page.properties;
  let pageId = page.id.replace(/\-/g, "");
  if (isLogging) console.log(props[nameProp].title[0].plain_text);

  let event = getEvent(calendar, props);

  if (props[statusProp] && props[statusProp].select.name == completedStatus) {
    if (event) {
      removeEvent(event, pageId);
      if (isLogging) console.log("remove event.");
    } else {
      if (isLogging) console.log("skip event.");
    }
    return;
  }

  if (!event) {
    event = createEvent(props, pageId);
    if (isLogging) console.log("create new event.");
  }

  if ((hoursProp in props)) {
    let extent = getExtentOfHours(props[dateProp].date.start, props[hoursProp].number);
    if (!isSameDateTime(event.getStartTime(), extent.startAt) ||
      !isSameDateTime(event.getEndTime(), extent.endAt)) {
      event.setTime(extent.startAt, extent.endAt);
      if (isLogging) console.log("set date.");
    } else {
      if (isLogging) console.log("skip event.");
    }
  } else {
    let start = new Date(props[dateProp].date.start);
    let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    if (!event.isAllDayEvent() || !isSameDateTime(event.getStartTime(), day)) {
      event.setAllDayDate(day);
      if (isLogging) console.log("set allday.");
    } else {
      if (isLogging) console.log("skip event.");
    }
  }
}

function getRichText(prop) {
  if (!prop) return "";
  if (prop.rich_text.length == 0) return "";
  return prop.rich_text[0].plain_text;
}

function formatDate(date) {
  return Utilities.formatDate(date, "JST", "yyyy/MM/dd HH:mm:ss");
}

function isSameDateTime(date1, date2) {
  return formatDate(date1) == formatDate(date2);
}

function getExtentOfHours(start, hours) {
  let startAt = new Date(start);
  if (start.length == 10) startAt.setHours(9);

  let endAt = new Date(start);
  if (start.length == 10) endAt.setHours(9);
  endAt.setHours(endAt.getHours() + hours);

  return { startAt: startAt, endAt: endAt };
}

function createEvent(props, pageId) {
  let calendar = CalendarApp.getCalendarById(calendarId);
  let event = calendar
    .createAllDayEvent(
      props[nameProp].title[0].plain_text,
      new Date()
    );

  event.setDescription(notionPrefix + pageId);
  event.setTag("notionPageId", pageId);

  let properties = {};
  properties[eventIdProp] = [{ type: "text", text: { content: event.getId() } }];
  postNotion("/pages/" + pageId, { properties: properties, }, "PATCH");

  return event;
}

function removeEvent(event, pageId) {
  let properties = {};
  properties[eventIdProp] = [{ type: "text", text: { content: "" } }];
  postNotion("/pages/" + pageId, { properties: properties, }, "PATCH");
  event.deleteEvent();
}

function fetchNotion(lastAccess) {
  let now = new Date();
  let after = Utilities.formatDate(addDate(new Date(), daysForSearch * -1), "JST", "yyyy-MM-dd");
  let before = Utilities.formatDate(addDate(new Date(), daysForSearch), "JST", "yyyy-MM-dd");

  let payload = {
    sorts: [{ property: dateProp, direction: "descending" }],
    filter: {
      and: [
        { property: dateProp, date: { after: after } },
        { property: dateProp, date: { before: before } },
        // { property: statusProp, select: { does_not_equal: completedStatus, } },
        // { property: eventIdProp, text: { is_not_empty: true, } }
      ]
    }
  };
  let json = postNotion("/databases/" + notionDbId + "/query", payload);
  return json;
}

function postNotion(endpoint, payload, method) {
  let api = "https://api.notion.com/v1" + endpoint;
  let headers = {
    "Authorization": "Bearer " + notionToken,
    "Content-Type": "application/json",
    "Notion-Version": "2021-05-13"
  };

  let res = UrlFetchApp.fetch(
    api,
    {
      headers: headers,
      method: method || "POST",
      payload: JSON.stringify(payload),
    }
  );

  let json = JSON.parse(res.getContentText());
  return json;
}