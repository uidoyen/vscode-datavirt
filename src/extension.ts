/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as utils from './utils';
import { DataVirtNodeProvider } from './model/tree/DataVirtNodeProvider';
import { IDVConfig, IDataSourceConfig, IEnv } from './model/DataVirtModel';

let dataVirtExtensionOutputChannel: vscode.OutputChannel;
let dataVirtTreeView : vscode.TreeView<vscode.TreeItem>;
let dataVirtProvider : DataVirtNodeProvider;
let pluginResourcesPath: string;

export function activate(context: vscode.ExtensionContext) {

	dataVirtProvider = new DataVirtNodeProvider(vscode.workspace.rootPath, context);
	creatDataVirtView();

	pluginResourcesPath = context.asAbsolutePath('resources');

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.create.vdb', (ctx) => {
		vscode.window.showInputBox( {placeHolder: "Enter the name of the new VDB config"})
			.then( (fileName: string) => {
				handleVDBCreation(vscode.workspace.rootPath, fileName)
					.then( (success: boolean) => {
						if (success) {
							vscode.window.showInformationMessage(`New VDB ${fileName} has been created successfully...`);
						} else {
							vscode.window.showErrorMessage(`An error occured when trying to create a new VDB...`);
						}
					});
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.create.datasource', (ctx) => {
		vscode.window.showInputBox( {placeHolder: "Enter the name of the new datasource"})
			.then( (dsName: string) => {
				handleDataSourceCreation(ctx, dsName)
					.then( (success: boolean) => {
						if (success) {
							vscode.window.showInformationMessage(`New datasource ${dsName} has been created successfully...`);
						} else {
							vscode.window.showErrorMessage(`An error occured when trying to create a new datasource...`);
						}
					});
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.edit.datasource', (ctx) => {
		handleDataSourceEdit(ctx)
			.then( (success: boolean) => {
				if (success) {
					vscode.window.showInformationMessage(`DataSource has been modified...`);
				} else {
					vscode.window.showErrorMessage(`An error occured when trying to modify the datasource...`);
				}
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.delete.datasource', (ctx) => {
		handleDataSourceDeletion(ctx)
			.then( (success: boolean) => {
				if (success) {
					vscode.window.showInformationMessage(`DataSource has been deleted...`);
				} else {
					vscode.window.showErrorMessage(`An error occured when trying to delete the datasource...`);
				}
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.create.schema', (ctx) => {
		vscode.window.showInputBox( {placeHolder: "Enter the name of the new schema"})
			.then( (schemaName: string) => {
				handleSchemaCreation(ctx, schemaName)
					.then( (success: boolean) => {
						if (success) {
							vscode.window.showInformationMessage(`New schema ${schemaName} has been created successfully...`);
						} else {
							vscode.window.showErrorMessage(`An error occured when trying to create a new schema...`);
						}
					});
			});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.deploy', (ctx) => {
		let file: string;
		if (ctx && ctx.fsPath) {
			file = ctx.fsPath;
		} else {
			file = undefined;
		}

		handleDeploy(file);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('datavirt.undeploy', (ctx) => {
		let file: string;
		if (ctx && ctx.fsPath) {
			file = ctx.fsPath;
		} else {
			file = undefined;
		}

		handleUndeploy(file);
	}));
}

export function deactivate(context: vscode.ExtensionContext) {
	disposeExtensionOutputChannel();
}

export function log(text) {
	if (!dataVirtExtensionOutputChannel) {
		dataVirtExtensionOutputChannel = vscode.window.createOutputChannel("DataVirt Extension");
	}
	dataVirtExtensionOutputChannel.show();
	dataVirtExtensionOutputChannel.append(text.toString());
}

/* Used for testing purpose only*/
export function disposeExtensionOutputChannel() {
	if (dataVirtExtensionOutputChannel) {
		dataVirtExtensionOutputChannel.hide();
		dataVirtExtensionOutputChannel.dispose();
		dataVirtExtensionOutputChannel = undefined;
	}
}

function creatDataVirtView(): void {
	dataVirtTreeView = vscode.window.createTreeView('datavirt', {
		treeDataProvider: dataVirtProvider
	});
	dataVirtTreeView.onDidChangeVisibility(async () => {
		if (dataVirtTreeView.visible === true) {
			await dataVirtProvider.refresh().catch(err => console.log(err));
		}
	});
}

function handleVDBCreation(filepath: string, fileName: string): Promise<boolean> {
	return new Promise<boolean>( (resolve, reject) => {
		if (fileName && fileName.length>0) {
			try {
				let templatePath = path.join(pluginResourcesPath, "vdb_template.yaml");
				let targetFile: string = path.join(filepath, `${fileName}.yaml`);
				fs.copyFileSync(templatePath, targetFile);
				let yamlDoc:IDVConfig = utils.loadModelFromFile(targetFile);
				yamlDoc.metadata.name = fileName;
				utils.saveModelToFile(yamlDoc, targetFile);
				dataVirtProvider.refresh();
				resolve(true);
			} catch (error) {
				log(error);
				resolve(false);
			}
		} else {
			log("handleVDBCreation: Unable to create the VDB because no name was given...");
			resolve(false);
		}		
	});
}

function handleDataSourceCreation(ctx, dsName: string): Promise<boolean> {
	return new Promise<boolean>( (resolve, reject) => {
		if (dsName && dsName.length>0) {
			try {
				let yaml: IDVConfig = ctx.getProject().dvConfig;
				if (yaml) {
					let dsConfig: IDataSourceConfig = {
						name: dsName,
						type: "SPRING_DATASOURCE",
						entries: new Map<string, string>()
					};
					dsConfig.entries.set("USERNAME", "");
					dsConfig.entries.set("PASSWORD", "");
					dsConfig.entries.set("DATABASENAME", "");
					dsConfig.entries.set("JDBCURL", "");
					utils.mapDSConfigToEnv(dsConfig, yaml);
					utils.saveModelToFile(yaml, ctx.getProject().getFile());
					dataVirtProvider.refresh();
					resolve(true);
				} else {
					resolve(false);
				}				
			} catch (error) {
				log(error);
				resolve(false);
			}
		} else {
			log("handleDataSourceCreation: Unable to create the datasource because no name was given...");
			resolve(false);
		}		
	});
}

function handleDataSourceEdit(ctx): Promise<boolean> {
	return new Promise<boolean>( (resolve, reject) => {
		if (ctx) {
			try {
				let yaml: IDVConfig = ctx.getProject().dvConfig;
				if (yaml) {
					// let dsConfig: IDataSourceConfig = {
					// 	name: dsName,
					// 	type: "SPRING_DATASOURCE",
					// 	entries: new Map<string, string>()
					// };
					// dsConfig.entries.set("USERNAME", "");
					// dsConfig.entries.set("PASSWORD", "");
					// dsConfig.entries.set("DATABASENAME", "");
					// dsConfig.entries.set("JDBCURL", "");
					// mapDSConfigToEnv(dsConfig, yaml);
					// saveModelToFile(yaml, ctx.getProject().getFile());
					dataVirtProvider.refresh();
					resolve(true);
				} else {
					resolve(false);
				}				
			} catch (error) {
				log(error);
				resolve(false);
			}
		} else {
			log("handleDataSourceEdit: Unable to modify the datasource...");
			resolve(false);
		}		
	});
}

function handleDataSourceDeletion(ctx): Promise<boolean> {
	return new Promise<boolean>( (resolve, reject) => {
		if (ctx) {
			try {
				let yaml: IDVConfig = ctx.getProject().dvConfig;
				if (yaml) {
					// let dsConfig: IDataSourceConfig = {
					// 	name: dsName,
					// 	type: "SPRING_DATASOURCE",
					// 	entries: new Map<string, string>()
					// };
					// dsConfig.entries.set("USERNAME", "");
					// dsConfig.entries.set("PASSWORD", "");
					// dsConfig.entries.set("DATABASENAME", "");
					// dsConfig.entries.set("JDBCURL", "");
					// mapDSConfigToEnv(dsConfig, yaml);
					// saveModelToFile(yaml, ctx.getProject().getFile());
					dataVirtProvider.refresh();
					resolve(true);
				} else {
					resolve(false);
				}				
			} catch (error) {
				log(error);
				resolve(false);
			}
		} else {
			log("handleDataSourceEdit: Unable to delete the datasource...");
			resolve(false);
		}		
	});
}

function handleSchemaCreation(ctx, schemaName: string): Promise<boolean> {
	return new Promise<boolean>( (resolve, reject) => {
		if (schemaName && schemaName.length>0) {
			try {
				
				dataVirtProvider.refresh();
				resolve(true);
			} catch (error) {
				log(error);
				resolve(false);
			}
		} else {
			log("handleSchemaCreation: Unable to create the schema because no name was given...");
			resolve(false);
		}		
	});
}

function handleDeploy(filepath: string): void {
	log("\nDEPLOY: Selected File: " + filepath + "\n");
}

function handleUndeploy(filepath: string): void {
	log("\nUNDEPLOY: Selected File: " + filepath + "\n");
}
