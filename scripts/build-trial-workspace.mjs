import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('public/conservative-atlas');
let html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
html = html.replace('<title>BiblioMap · Adaptive Leadership</title>', '<title>BiblioMap · Hypergraph trials</title>');
html = html.replace('</head>', '<link rel="stylesheet" href="trial-workspace.css?v=canvas-3"></head>');
html = html.replace('<body class="workspace-shell"', '<body class="workspace-shell trial-workspace"');
html = html.replace('<script src="workspace-startup.js', '<script>window.ATLAS_TRIAL_WORKSPACE=true;</script><script src="workspace-startup.js');
html = html.replace(/evidence-explorer\.js\?v=[^"<]+/, 'trial-evidence-explorer.js?v=study-evidence-2');
html = html.replace(/app\.js\?v=[^"<]+/, 'trial-app.js?v=study-evidence-2');
html = html.replace(/workspace-shell\.js\?v=[^"<]+/, 'trial-workspace-shell.js?v=coupling-errors-3');
html = html.replace(/<script src="(?:workspace-projects|historiography-browser|workspace-routing)\.js[^<]+<\/script>/g, '');
html = html.replace('</body>', '<script src="hypergraph-lab.js?v=coupling-errors-2"></script></body>');
fs.writeFileSync(path.join(directory, 'hypergraph-lab.html'), html);
for (const name of ['app','workspace-shell']) fs.copyFileSync(path.join(directory, name + '.js'), path.join(directory, 'trial-' + name + '.js'));
