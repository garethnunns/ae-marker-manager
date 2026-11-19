// The source files, in the order they're joined into the panel. Core first
// (plain ES3, no After Effects), then what talks to After Effects.
export const CORE = [
  'src/core/util.js',
  'src/core/time.js',
  'src/core/csv.js',
  'src/core/serial.js',
  'src/core/markers.js',
  'src/core/place.js',
  'src/core/table.js',
  'src/core/reaper.js',
  'src/core/trigger.js',
];

export const AE = [
  'src/ae/settings.jsx',
  'src/ae/markers.jsx',
  'src/ae/io.jsx',
  'src/ae/ui.jsx',
];

// The built panel.
export const OUT = 'dist/Marker Manager.jsx';
