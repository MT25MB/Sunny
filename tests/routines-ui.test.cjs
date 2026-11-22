/**
 * Routines UI and the Stop control for running computer-use jobs.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const APP = R('src/App.tsx');
const MAIN = R('src/electron/main.cjs');
const PRELOAD = R('src/electron/preload.cjs');
const TYPES = R('src/vite-env.d.ts');
const CSS = R('src/index.css');

test('routines are readable and deletable from the UI', () => {
  assert.match(MAIN, /ipcMain\.handle\('sunny:get-routines'/);
  assert.match(MAIN, /ipcMain\.handle\('sunny:delete-routine'/);
  assert.match(PRELOAD, /getRoutines: \(\) => ipcRenderer\.invoke\('sunny:get-routines'\)/);
  assert.match(PRELOAD, /deleteRoutine: \(phrase\)/);
  assert.match(TYPES, /getRoutines: \(\)/);
  assert.match(APP, /window\.sunnyDesktop\?\.getRoutines\?\./);
  assert.match(APP, /handleDeleteRoutine/);
  assert.match(APP, /<Bookmark size=\{18\} \/> Routines/);
});

test('a running job can be stopped from the UI', () => {
  assert.match(MAIN, /cancelComputerUseJobs\(\);/);
  assert.match(PRELOAD, /onJobProgress/);
  assert.match(TYPES, /onJobProgress/);
  assert.match(APP, /activeJob/);
  assert.match(APP, /handleStopJob/);
  assert.match(APP, /window\.sunnyDesktop\?\.cancelActions\?\./);
  assert.match(APP, /className="job-stop"/);
  assert.match(CSS, /\.job-stop \{/);
});

test('job progress is cleared when the chat handlers finish', () => {
  assert.ok(APP.includes('setActiveJob(null);'), 'handlers must clear the job state');
  assert.match(APP, /onJobProgress.*setActiveJob\(info\)/s);
});

test('routine cards show steps and offer run and delete', () => {
  assert.match(APP, /routine-card/);
  assert.match(APP, /routine-run/);
  assert.match(APP, /routine-delete/);
  assert.match(APP, /routine\.steps\.map/);
});
