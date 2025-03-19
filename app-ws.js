/**
 * This tries to allow users to develop simple layouts without needing to create any JS
 * Just adding a script reference and giving the elements the correct ID should update everything for them.
 *
 * Most elements are updating the contents of the corresponding ID but the progress bar and colour items are using css variables.
 */



const mts = 1000; // millis to seconds
const mtm = 1000 * 60; // millis to minutes
const mth = 1000 * 60 * 60; // millis to hours

const leftPad = (number) => {
  return Math.floor(number).toString().padStart(2, '0');
};

/**
 * If the number is between +/- 1000 it is left as is
 * everything else is converted from milliseconds to a human readable HH:MM:SS string
 * @param {number} number
 */
const formatTimer = (number) => {
  const millis = Math.abs(number);
  const isNegative = number < 0;
  if (number <= 1000 && number >= -1000) { return JSON.stringify(number);};
  return `${isNegative ? '-' : ''}${leftPad(millis / mth)}:${leftPad((millis % mth) / mtm)}:${leftPad((millis % mtm) / mts, )}`;
};

/**
 * Clears the html contents with ID, color or checkbox that partially match the input string
 * If the content has a timer it is replaced with a placeholder, otherwise it is cleared fully.
 * @param {string} clearID
 */
const clearIDs = (clearID) => {
    const foundID = document.querySelectorAll("[id^='"+clearID+"']");
    const foundBoolean = document.querySelectorAll("input[type='checkbox'][id^='" + clearID + "']");
    const foundColour = document.getElementById(clearID + "-colour");

    foundID.forEach((element) => /\d{2}:\d{2}:\d{2}/.test(element.innerText)?element.innerText ="--:--:--":element.innerText = "");
    foundBoolean.forEach((element) => element.checked = false);
    if(foundColour){foundColour.style.setProperty('--'+clearID+'-colour', 'transparent')};
};

/**
 * Updates the html when a new message is received
 * @param {string} field
 * @param {any} payload
 */
const updateDOM = (field, payload) => {
  // get element
  const el = document.getElementById(field);
  if (el) {
    // change data depending on type
    if(typeof payload == "boolean") {
      el.checked = payload;
    } else if (typeof payload == "number") { // if number is timerelated, convert to human readout.
      let numberValue = JSON.stringify(payload, null, 2);
      const keys = ["clock","time","duration","delay","gap","startedAt"];
      Object.entries(keys).forEach(([key, keyValue])=>{ if(field.includes(keyValue)){numberValue=formatTimer(payload)};});
      el.innerText = numberValue;
    } else if (field.includes("colour")) { // set css variable
      el.style.setProperty('--'+field, payload);
    } else if (field.includes("custom")) { // display custom fields, no processing beyond that currently in this implementation.
      el.innerText = JSON.stringify(payload, null, 2);
    } else {
      el.innerText = payload;
    };

    // update timestamp
    const tag = document.getElementById('timestamp');
    if(tag) { tag.innerText = new Date(); };
  }
};

let reconnectTimeout;
const reconnectInterval = 1000;
let reconnectAttempts = 0;

const connectSocket = () => {
  const websocket = new WebSocket(`ws://${window.location.hostname}:${window.location.port}/ws`);

  websocket.onopen = () => {
    clearTimeout(reconnectTimeout);
    reconnectAttempts = 0;
    console.warn('WebSocket connected');
  };

  websocket.onclose = () => {
    console.warn('WebSocket disconnected');
    reconnectTimeout = setTimeout(() => {
      console.warn(`WebSocket: attempting reconnect ${reconnectAttempts}`);
      if (websocket && websocket.readyState === WebSocket.CLOSED) {
        reconnectAttempts += 1;
        connectSocket();
      }
    }, reconnectInterval);
  };
  websocket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // all objects from ontime are structured with type and payload
    const { type, payload } = data;

    // Choose what to do depending on message type
    switch (type) {
      case 'ontime': {
        // destructure known data from ontime
        // see https://docs.getontime.no/api/data/runtime-data/
        const { current, playback } = payload.timer;
        // updateTimerElement(playback, current);

        const { subPart, subValue } = payload;

        // Only try to fill items if OnTime is not stopped.
        if(!payload.eventNow){break;};

        let eventNow = payload.eventNow;
        let eventNext = payload.eventNext;
        let publicEventNow = payload.publicEventNow;
        let publicEventNext = payload.publicEventNext;
        let currentBlock = payload.currentBlock.block;
        if(currentBlock){currentBlock.startedAt = payload.currentBlock.startedAt;};

        let message = payload.message.timer;
        let runtime = payload.runtime;
        let auxtimer1 = payload.auxtimer1;


        if(eventNow) { Object.entries(eventNow).forEach(([key,value]) => { updateDOM('eventNow-'+key, value); }); };
        if(eventNext) { Object.entries(eventNext).forEach(([key,value]) => { updateDOM('eventNext-'+key, value); }); };
        if(publicEventNow) { Object.entries(publicEventNow).forEach(([key,value]) => { updateDOM('publicEventNow-'+key, value); }); };
        if(publicEventNext) { Object.entries(publicEventNext).forEach(([key,value]) => { updateDOM('publicEventNext-'+key, value); }); };
        if(currentBlock) { Object.entries(currentBlock).forEach(([key,value]) => { updateDOM('currentBlock-'+key, value); }); };

        updateDOM('onAir-onAir', payload.onAir);
        updateDOM('clock-clock', payload.clock);
        Object.entries(message).forEach(([key,value]) => { updateDOM('message-'+key, value); });
        updateDOM('message-external', payload.message.external);
        Object.entries(runtime).forEach(([key,value]) => { updateDOM('runtime-'+key, value); });
        Object.entries(auxtimer1).forEach(([key,value]) => { updateDOM('auxtimer1-'+key, value); });

        if(eventNow) { // update progress bar css variables
          const partDanger = (eventNow.timeDanger / eventNow.duration) * 100 + '%';
          const partWarning = (eventNow.timeWarning / eventNow.duration) * 100 + "%";
          document.documentElement.style.setProperty('--barStart', partWarning);
          document.documentElement.style.setProperty('--barEnd', partDanger);
        };

        break;
      }
      case 'ontime-eventNow': {  // update for eventNow items
        if(!payload) { clearIDs("eventNow"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('eventNow-'+key, value); });
        // calculate and update warning and danger for progress bar css variables.
        const partDanger = (payload.timeDanger / payload.duration) * 100 + '%';
        const partWarning = (payload.timeWarning / payload.duration) * 100 + "%";
        document.documentElement.style.setProperty('--barStart', partWarning);
        document.documentElement.style.setProperty('--barEnd', partDanger);
        break;
      }
      case 'ontime-eventNext': {  // update for eventNext items
        if(!payload) { clearIDs("eventNext"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('eventNext-'+key, value); });
        break;
      }
      case 'ontime-publicEventNow': {  // update for publicEventNow items
        if(!payload) { clearIDs("publicEventNow"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('publicEventNow-'+key, value); });
        break;
      }
      case 'ontime-publicEventNext': {  // update for eventNow items
        if(!payload) { clearIDs("publicEventNext"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('publicEventNext-'+key, value); });
        break;
      }
      case 'ontime-message': {   // Update message items
        if(!payload) { clearIDs("message"); break; };
        Object.entries(payload.timer).forEach(([key,value]) => { updateDOM('message-'+key, value); });
        updateDOM('message-external', payload.external);
        break;
      }
      case 'ontime-timer': {   // Update timer items
        if(!payload.current) {
          Object.entries(payload).forEach(([key,value]) => { updateDOM('timer-'+key, value); });
          const keys = ['timer-addedTime', 'timer-current','timer-duration','timer-elapsed','timer-expectedFinish','timer-finishedAt','timer-startedAt'];
          Object.entries(keys).forEach(([key, value])=>{ const el = document.getElementById(value); if(el){el.innerText="--:--:--"}; });
          document.documentElement.style.setProperty('--barStart', '0%');
          document.documentElement.style.setProperty('--barEnd', '0%');
          document.documentElement.style.setProperty('--barProgress','100%');
          break;
        };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('timer-'+key, value); });
        // calculate and update a progress bar css variable.
        if(payload.playback == "play") { document.documentElement.style.setProperty('--barProgress',(payload.elapsed/payload.duration)*100 + '%');        };

        break;
      }
      case 'ontime-auxtimer1': {   // Update auxtimer1 items
        if(!payload) { clearIDs("auxtimer1"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('auxtimer1-'+key, value); });
        break;
      }
      case 'ontime-onAir': {   // Update onAir item
        updateDOM('onAir-onAir', payload);
        break;
      }
      case 'ontime-clock': {   // Update clock item
        if(!payload) { clearIDs("clock"); break; };
        updateDOM('clock-clock', payload);
        break;
      }
      case 'ontime-runtime': {   // Update runtime items
        if(!payload) { clearIDs("runtime"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('runtime-'+key, value); });
        break;
      }
      case 'ontime-log': {   // Update runtime items
        if(!payload) { clearIDs("log"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('log-'+key, value); });
        break;
      }
      case 'ontime-currentBlock': {   // Update block items
        if(!payload.startedAt) { clearIDs("currentBlock"); break; };
        let blockData = payload.block;
        blockData.startedAt = payload.startedAt;
        Object.entries(blockData).forEach(([key,value]) => { updateDOM('currentBlock-'+key, value); });
        break;
      }
      case 'client': {   // Update client items (clientId, clientName)
        if(!payload) { clearIDs("client"); break; };
        Object.entries(payload).forEach(([key,value]) => { updateDOM('client-'+key, value); });
        break;
      }
    }
  };
};

connectSocket();

