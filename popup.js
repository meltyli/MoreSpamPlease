"use strict";

const el = id => document.getElementById(id);
const start = el("start");
const automatic = el("automatic");
const minutes = el("minutes");
let busySaving = false;
let firstLoad = true;
let fetching = false;

function formatTime(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString() : "—";
}

function render(state) {
  const running = state.status.phase === "processing";
  el("status").textContent = running ? "Processing" : "Idle";
  el("indicator").classList.toggle("running", running);
  el("account").textContent = running
    ? `Account: ${state.status.account || "discovering…"}`
    : "Ready for next scan";
  const counts = running ? state.status : state.lastRun;
  el("examined").textContent = counts?.examined ?? 0;
  el("rescued").textContent = counts?.rescued ?? 0;
  el("failed").textContent = counts?.failed ?? 0;
  start.disabled = running;
  start.textContent = running ? "Processing…" : "Start Now";
  el("next").textContent = state.config.automatic
    ? `Next scan: ${formatTime(state.nextScan)}`
    : "Next scan: Disabled";

  if (firstLoad && !busySaving) {
    automatic.checked = state.config.automatic;
    minutes.value = state.config.minutes;
    firstLoad = false;
  }

  const last = state.lastRun;
  el("last").textContent = last
    ? `${formatTime(last.at)} · ${last.rescued} rescued · ${last.failed} failed`
    : "None";
  // Show last run error; don't expose mail subjects or addresses.
  if (!busySaving) {
    el("error").textContent = last?.failed
      ? `Last error: ${last.lastError}` : "";
  }
}

async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    const state = await messenger.runtime.sendMessage({ type: "getState" });
    render(state);
  } catch (error) {
    el("status").textContent = "Disconnected";
    el("error").textContent = String(error?.message || error);
  } finally {
    fetching = false;
  }
}

start.addEventListener("click", async () => {
  start.disabled = true;
  el("status").textContent = "Starting…";
  try {
    await messenger.runtime.sendMessage({ type: "startNow" });
    await refresh();
  } catch (error) {
    el("error").textContent = String(error?.message || error);
    start.disabled = false;
  }
});

async function saveSettings() {
  busySaving = true;
  try {
    const count = Number(minutes.value);
    if (!Number.isInteger(count) || count < 1 || count > 1440) {
      throw new Error("Frequency must be whole number from 1 to 1440 minutes");
    }
    await messenger.runtime.sendMessage({
      type: "saveConfig",
      config: { automatic: automatic.checked, minutes: count }
    });
    el("error").textContent = "";
  } catch (error) {
    el("error").textContent = String(error?.message || error);
  } finally {
    busySaving = false;
    await refresh();
  }
}

automatic.addEventListener("change", saveSettings);
minutes.addEventListener("change", saveSettings);
refresh();
setInterval(refresh, 1000);
