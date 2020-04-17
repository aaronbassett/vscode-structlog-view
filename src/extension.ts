import * as vscode from 'vscode'


export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('structlog.start', () => {
			StructlogPanel.createOrShow(context.extensionPath)
		})
	)

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		StructlogPanel.config_updated()
	}))
}


class StructlogPanel {
	public static currentPanel: StructlogPanel | undefined;

	public static readonly viewType = 'structlog'

	private readonly _panel: vscode.WebviewPanel
	private readonly _extensionPath: string
	private _disposables: vscode.Disposable[] = []

	public static createOrShow(extensionPath: string) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined

		// If we already have a panel, show it.
		if (StructlogPanel.currentPanel) {
			StructlogPanel.currentPanel._panel.reveal(column)
			return
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			StructlogPanel.viewType,
			'Structlog View',
			column || vscode.ViewColumn.One,
			{
				// Enable javascript in the webview
				enableScripts: true,
			}
		);

		StructlogPanel.currentPanel = new StructlogPanel(panel, extensionPath)
	}

	public static config_updated() {
		if (StructlogPanel.currentPanel) {
			StructlogPanel.currentPanel._update()
			return
		}
	}

	public static revive(panel: vscode.WebviewPanel, extensionPath: string) {
		StructlogPanel.currentPanel = new StructlogPanel(panel, extensionPath)
	}

	private constructor(panel: vscode.WebviewPanel, extensionPath: string) {
		this._panel = panel
		this._extensionPath = extensionPath

		// Set the webview's initial html content
		this._update()

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update()
				}
			},
			null,
			this._disposables
		);
	}

	public dispose() {
		StructlogPanel.currentPanel = undefined
		this._panel.dispose()
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose()
			}
		}
	}

	private _update() {
		this._panel.title = 'Structlog View'
		this._panel.webview.html = this._getHtmlForWebview()
	}

	private _getHtmlForWebview() {

		const logtype = vscode.workspace.getConfiguration().get('structlog.logstype')
		const websocketServer = vscode.workspace.getConfiguration().get('structlog.logWebSocketUrl')

		const HTMLHead = `<!DOCTYPE html>
		<html>
		
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<title>Hello Bulma!</title>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.8.2/css/bulma.min.css">
			<script defer src="https://use.fontawesome.com/releases/v5.3.1/js/all.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.24.0/moment.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/handlebars.js/4.7.6/handlebars.min.js"></script>
			<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/smoothie/1.34.0/smoothie.js"></script>
			<style>
				html, body { background-color: var(--vscode-editor-background) }
			</style>
		</head>`

		const CPUBody = `<body>
		<section class="section">
			<canvas id='chart' width='600px' height='400px'></canvas>
			<ul>
				<li><i style="color:rgba(240, 58, 71, 1)">Camano: <span id="camano-perc"></span>%</i></li>
				<li><i style="color:rgba(22, 44, 81, 1)">Rosario: <span id="rosario-perc"></span>%</i></li>
				<li><i style="color:rgba(181, 51, 191, 1)">Monaco: <span id="monaco-perc"></span>%</i></li>
			</ul>
		</section>
		
		<script>
				const websocket = new WebSocket('${websocketServer}')
				const seen = []
		
				let smoothie = new SmoothieChart({
					grid: {
						strokeStyle: 'rgba(172, 179, 185, 0.1)',
						fillStyle: 'rgba(73, 88, 103, 1)',
						lineWidth: 1,
						millisPerLine: 250,
						verticalSections: 12,
						borderVisible: false
					},
					labels: {
						disabled: true
					}
				});
				smoothie.streamTo(document.getElementById("chart"), 500);
		
				let servers = {
					Camano: new TimeSeries(),
					Rosario: new TimeSeries(),
					Monaco: new TimeSeries(),
				}
		
				smoothie.addTimeSeries(
					servers['Camano'],
					{
						strokeStyle: 'rgba(240, 58, 71, 1)',
						fillStyle: 'rgba(240, 58, 71, 0.4)',
						lineWidth: 3
					}
				)
		
				smoothie.addTimeSeries(
					servers['Rosario'],
					{
						strokeStyle: 'rgba(22, 44, 81, 1)',
						fillStyle: 'rgba(22, 44, 81, 0.4)',
						lineWidth: 3
					}
				)
		
				smoothie.addTimeSeries(
					servers['Monaco'],
					{
						strokeStyle: 'rgba(181, 51, 191, 1)',
						fillStyle: 'rgba(181, 51, 191, 0.4)',
						lineWidth: 3
					}
				)
		
				websocket.onmessage = function (evt) {
					let entry = JSON.parse(evt.data)
					if (entry.type == "cpu") {
						if (!seen.includes(entry.uuid)) {
							seen.push(entry.uuid)
		
							let Camano = entry.servers.Camano
							let Rosario = entry.servers.Rosario
							let Monaco = entry.servers.Monaco
		
							servers['Camano'].append(new Date().getTime(), Camano)
							servers['Rosario'].append(new Date().getTime(), Rosario)
							servers['Monaco'].append(new Date().getTime(), Monaco)
		
							document.getElementById('camano-perc').textContent = Camano
							document.getElementById('rosario-perc').textContent = Rosario
							document.getElementById('monaco-perc').textContent = Monaco
						}
					}
				}
			</script>
		</body>
		
		</html>`

		const UserBody = `<body>
		<section class="section">
			<div class="container" id="logitems"></div>
		</section>
	
		<template id="logitem-user">
			<article class="message is-{{ level }}">
				<div class="message-header">
					<p>[{{ level }}] {{ logger }} </p>
					<p class="is-size-7">{{ when }}</p>
				</div>
				<div class="message-body">
					<div class="media">
						<div class="media-left">
							<figure class="image is-96x96">
								<img class="is-rounded" src="{{ avatar }}">
							</figure>
						</div>
						<div class="media-content">
							<p class="title is-2">{{ username }}</p>
							<p class="subtitle is-6">{{ job_title }} - <a href="mailto:{{ email }}">{{ email }}</a></p>
						</div>
					</div><br />
	
	
					<div class="columns">
						<div class="column">
							<ul>
								<li><strong>UUID:</strong> {{ uuid }}</li>
								<li><strong>Logger:</strong> {{ logger }}</li>
								<li><strong>Level:</strong> {{ level }}</li>
							</ul>
						</div>
						<div class="column">
							<ul>
								<li><strong>Event:</strong> {{ event }}</li>
								<li><strong>IP:</strong> {{ ip }}</li>
								<li><strong>URL:</strong> <a href="{{ url }}">{{ url }}</a></li>
							</ul>
						</div>
					</div>
				</div>
			</article>
		</template>
		
		<script>
				const source = document.getElementById("logitem-user").innerHTML
				const template = Handlebars.compile(source)
				const websocket = new WebSocket('${websocketServer}')
				const seen = []
		
				websocket.onmessage = function (evt) {
					let entry = JSON.parse(evt.data)
					if (entry.type == "user") {
						if (!seen.includes(entry.uuid)) {
							seen.push(entry.uuid)
							entry.when = moment(entry.timestamp).fromNow()
							entry.level = ["critical", "error"].includes(entry.level) ? "danger" : entry.level
							let html = template(entry)
		
							document.getElementById("logitems").innerHTML = html + document.getElementById("logitems").innerHTML
						}
					}
				}
			</script>
		</body>
		
		</html>`

		const AccessBody = `<body>
		<section class="section">
			<div class="container" id="logitems"></div>
		</section>
		
		<template id="logitem-access">
				<article class="message is-{{ level }}">
					<div class="message-header">
						<p>{{ event }}</p>
						<p class="is-size-7">{{ when }}</p>
					</div>
					<div class="message-body">
						<p><strong>{{ status }}</strong> - {{ url }}{{ path }}</p>
						<p class="is-7"><small>{{ ip }} | {{ uuid }} | {{ logger }} | {{ timestamp }}</small></p>
					</div>
				</article>
			</template>
		
			<script>
				const source = document.getElementById("logitem-access").innerHTML
				const template = Handlebars.compile(source)
				const websocket = new WebSocket('${websocketServer}')
				const seen = []
		
				websocket.onmessage = function (evt) {
					let entry = JSON.parse(evt.data)
					if (entry.type == "access") {
						if (!seen.includes(entry.uuid)) {
							seen.push(entry.uuid)
							entry.when = moment(entry.timestamp).fromNow()
							entry.level = ["critical", "error"].includes(entry.level) ? "danger" : entry.level
		
							let html = template(entry)
							document.getElementById("logitems").innerHTML = html + document.getElementById("logitems").innerHTML
						}
					}
				}
			</script>
		</body>
		
		</html>`

		switch (logtype) {
			case 'access':
				return `${HTMLHead}${AccessBody}`
			case 'cpu':
				return `${HTMLHead}${CPUBody}`;
			default:
				return `${HTMLHead}${UserBody}`
		}
	}
}

