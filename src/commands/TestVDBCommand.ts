import * as vscode from "vscode";
var Docker = require("dockerode");
var fs = require("fs");
var path = require("path");
import { DVProjectTreeNode } from '../model/tree/DVProjectTreeNode';

export async function testVDBCommand(prjNode: DVProjectTreeNode) {

	var config = vscode.workspace.getConfiguration('pgsql');
	config.update("connection", `postgres://postgres:test@localhost:35432/${prjNode.dvConfig.metadata.name}`, true)

	// var config = vscode.workspace.getConfiguration('vscode-postgres');
	// config.update("defaultDatabase", `${prjNode.dvConfig.metadata.name}`, true);
	// console.log(config)

	// config.update("defaultDatabase", );
	// vscode.commands.executeCommand('vscode-postgres.addConnection');

	var socket = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
	var stats = fs.statSync(socket);
	if (!stats.isSocket()) {
		throw new Error("Are you sure the docker is running?");
	}
	const docker = new Docker({
		socketPath: socket,
	});
	const IMAGE = "quay.io/teiid/virtualdatabase-builder";
	const rootPath = vscode.workspace.rootPath;
	interface HostconfigInterface {
		Privileged: true;
		PortBindings: object;
		Binds: Array<Object>;
	}
	interface ConfigureApiOptions {
		AttachStdin: boolean;
		AttachStdout: boolean;
		AttachStderr: boolean;
		Tty: boolean;
		OpenStdin: boolean;
		StdinOnce: boolean;
		User: string;
		Cmd: Array<string>;
		Image: string;
		Volumes: object;
		Hostconfig: HostconfigInterface;
		ExposedPorts: object;
	}
	interface attachOptions {
		stream: boolean;
		stdin: boolean;
		stdout: boolean;
		stderr: boolean;
	}
	// Stop container if already exists
	docker.listContainers({ all: true }, function (containers) {
		containers.forEach(function (container) {
			if(container.Image === "quay.io/teiid/virtualdatabase-builder"){
				stopContainer(container.Id)
			}
		})
	});
	async function stopContainer(containerId) {
		var container = await docker.getContainer(containerId)
		try {
			await container.stop();
		} catch (err) {
			console.log(err);
		}
	}
	async function handleCreateContainer(container) {
		try {
			var attach_opts = <attachOptions>{
				stream: true,
				stdin: true,
				stdout: true,
				stderr: true,
			};
			container.attach(attach_opts, function(attacherr) {

				if (attacherr) {
					console.log("attacherr", attacherr);
					return;
				}

				container.start(function (starterr) {
					if (starterr) {
						console.log(starterr);
						return;
					}

					const activeTerminal = (<any>vscode.window).createTerminal(`DataVirt`);
					activeTerminal.show();

					activeTerminal.sendText(`docker exec -it ${container.id} /bin/sh -c "[ -e /bin/bash ] && /bin/bash || /bin/sh"`);
					activeTerminal.sendText(`./run.sh ${prjNode.dvConfig.metadata.name}`);

					let logFolder = `${rootPath}/build/tmp`;
					let logFile = `${rootPath}/build/tmp/log.txt`;

					fs.promises.mkdir(logFolder, {recursive: true})
					.then(() => fs.promises.writeFile(logFile)).then(() =>
					fs.watch(logFile, (eventType) => {

						fs.readFile(logFile, function (readerr, buf) {
							if (readerr) {
								console.log(readerr);
								return;
							}
							let content = buf.toString();
							const matched = content.search("Started Application");

							if (matched !== -1) {
								var defaultSqlCommand = "Select * from note;";
								var filePath = path.join(rootPath, `${prjNode.dvConfig.metadata.name}.pgsql`);
								fs.writeFileSync(filePath, defaultSqlCommand, "utf8");

								var openPath = vscode.Uri.file(filePath);
								vscode.workspace
									.openTextDocument(openPath)
									.then((doc) => {
										vscode.window.showTextDocument(doc);
										executePsql();
									});
							} else {
								console.log("Not started...");
							}
						});
					}))
				});
			});
		} catch (err) {
			console.log(err);
		}
	}
	async function executePsql() {
		try {
			var xmlExtension = vscode.extensions.getExtension("doublefint.pgsql");
			if (xmlExtension.isActive == false) {
				xmlExtension.activate().then(
					function () {
						vscode.commands.executeCommand("pgsql.run");
					},
					function () {
						console.log("Extension activation failed");
					}
				);
			} else {
				vscode.commands.executeCommand("pgsql.run");
			}
		} catch(err){
			console.log(err);
		}
	}
	docker.createContainer(
		{
			AttachStdin: true,
			AttachStdout: true,
			AttachStderr: true,
			Tty: true,
			OpenStdin: true,
			StdinOnce: false,
			User: "root",
			Cmd: ["bash"],
			Image: IMAGE,
			Volumes: { "/home/jboss/vdb": {} },
			Hostconfig: {
				Privileged: true,
				PortBindings: { "35432/tcp": [{ HostPort: "35432" }] },
				Binds: [`${rootPath}:/home/jboss/vdb`],
			},
			ExposedPorts: { "35432/tcp": {} },
		} as ConfigureApiOptions, handleCreateContainer);
}


