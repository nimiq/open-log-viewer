<template>
    <v-app id="drag-and-drop-zone">
		<v-tabs show-arrows v-model="currentTab" hide-slider>
			<v-tab v-for="(tab, i) in tabs" :key="tab.id" :title="tab.filePath" :href="'#tab' + tab.id" @change="onTabChanged('tab' + tab.id)">

				{{ tab.fileName }}

				<v-btn flat icon @click.stop.prevent="closeTab(i)" :disabled="!showCloseButton()">
					<v-icon>close</v-icon>
				</v-btn>
		    </v-tab>

			<v-btn flat icon color="grey darken-1" @click="newTab">
            	<v-icon>add</v-icon>
            </v-btn>
		</v-tabs>

		<v-tabs-items v-model="currentTab">
			<v-tab-item v-for="(tab, i) in tabs" :key="tab.id" :value="'tab' + tab.id" >
				<file-chooser v-if="!tab.hasFile()" @change="onFileChanged($event, tab, i)" />
	
				<file-viewer 
					ref="fileViewer" 
					v-if="tab.hasFile()"
					:file="tab.filePath" 
					:file-settings="tab.fileSettings"
					:global-settings="globalSettings"
					@settingsButtonClicked="settingsButtonClicked"
					@cursorTimestampChanged="cursorTimestampChanged"
					@fileNotFoundError="fileNotFoundErrorHandler" />
			</v-tab-item>
		</v-tabs-items>

		<settings-dialog 
			:show="showSettings"
			:settings="globalSettings"
			@accept="acceptSettings" 
			@close="closeSettings">
		</settings-dialog>

		<message-dialog 
			:show="showMessageDialog" 
			:severity="'error'" 
			:title="messageDialogTitle" 
			:message="messageDialogMessage"
			@close="closeMessageDialog">
		</message-dialog>
    </v-app>
</template>

<script>
	const _ = require('lodash');
	const Tab = require("./tab");
	const app = window.electron.app;
	const remote = window.electron.remote;
	const fs = window.node.fs;
	const FileSettings = require("./fileSettings");
	const UserPreferences = require("./userPreferences");
	const OpenNewFileCommand = require("./commands/openNewFileCommand");
	const AceEditor = require("./aceEditor");
	const Utils = require("./utils");
	const FileChooser = require("./components/FileChooser").default;
	const FileViewer = require("./components/FileViewer").default;
	const MessageDialog = require("./components/MessageDialog").default;
	const SettingsDialog = require("./components/SettingsDialog").default;

	let userPreferences = new UserPreferences();

	export default {
		components: {
			FileChooser, 
			FileViewer, 
			MessageDialog,
			SettingsDialog
		},
		data() {
			return {
				tabs: [],
				currentTab: null,
				showSettings: false,
				globalSettings: userPreferences.getGlobalSettings(),
				showMessageDialog: false,
				messageDialogTitle: '',
				messageDialogMessage: ''
			}
		},
		created: function() {
			AceEditor.init(this.globalSettings);
			this.changeLogSeverityStyles();
		},
		mounted: function() {
			userPreferences.getFiles().forEach(file => {
				if (fs.existsSync(file.path)) {
					let tab = new Tab(file.name, file.path, FileSettings.createFromSettings(file.settings));

					this.tabs.push(tab);
				}
				else {
					userPreferences.removeFile(file.path);
				}
			});

			if (remote.getGlobal('arguments').file) {
				const file = remote.getGlobal('arguments').file;
				try {
					new OpenNewFileCommand(
						file, 
						this.tabs, 
						userPreferences
					)
					.execute();
				}
				catch(error) {
					this.showFileNotFoundMessageDialog(file);
				}
			}
			
			if (this.tabs.length === 0) {
				this.tabs.push(new Tab(this.$t("new-file")));
			}

			document.getElementById("drag-and-drop-zone").ondrop = (e) => {
            	e.preventDefault();

            	for (let file of e.dataTransfer.files) {
					new OpenNewFileCommand(
						file.path, 
						this.tabs, 
						userPreferences
					)
					.execute();
            	}
            
            	return false;
			};
		},
		methods: {
			newTab() {
				const tab = new Tab(this.$t("new-file"));
				this.tabs.push(tab);
				this.currentTab = 'tab' + tab.id;
			},
			closeTab(index) {
				userPreferences.removeFile(this.tabs[index].filePath);

				if (this.tabs.length > 1) {
					this.tabs.splice(index, 1);
				} else {
					this.tabs[0].reset(this.$t("new-file"));
				}
			},
			onTabChanged(tabId) {
				const viewer = this.getViewerForTab(tabId);
				if (viewer) {
					viewer.focus();
				}
			},
			showCloseButton() {
				return this.tabs.length > 1 || this.tabs[0].hasFile();
			},
			onFileChanged(event, tab, tabIndex) {
				for (let file of event.target.files) {
					if (!tab) {
						tab = new Tab();
						this.tabs.splice(++tabIndex, 0, tab);
					}

					const settings = new FileSettings();
					tab.setFileName(file.name);
					tab.setFilePath(file.path);
					tab.setFileSettings(settings);
					userPreferences.addFile(file.name, file.path, settings);

					tab = null;
				}
			},
			fileNotFoundErrorHandler(event) {
				this.showFileNotFoundMessageDialog(event.file);
			},
			showFileNotFoundMessageDialog(file) {
				this.showMessageDialog = true;
				this.messageDialogTitle = this.$i18n.t("warning");
				this.messageDialogMessage = this.$i18n.t("file-no-exists", {filename: file});
			},
			closeMessageDialog() {
				this.showMessageDialog = false;
			},
			settingsButtonClicked() {
				this.showSettings = true;
			},
			closeSettings() {
				this.showSettings = false;
			},
			acceptSettings(eventData) {
				this.globalSettings = _.merge(this.globalSettings, eventData.newSettings);

				userPreferences.saveGlobalSettings(this.globalSettings);

				this.closeSettings();
				this.changeLogSeverityStyles();
				this.changeFontSize(eventData.newSettings.fontSize);

				if (eventData.relaunch) {
					app.relaunch();
					app.exit();
				}
			},
			changeLogSeverityStyles() {
				const logSeverityStyles = Array.from(document.styleSheets).find(styleSheet => styleSheet.title === "log-severity-styles");
			
				Array.from(logSeverityStyles.rules).forEach(rule => {
					const severity = rule.selectorText.replace(".ace_", "");
					const textColor = this.globalSettings[severity].textColor;

					let backgroundColor = this.globalSettings[severity].backgroundColor;
					// Convert to rgba to be compatible with 1.0.0 version
					if (backgroundColor.startsWith("#")) {
						backgroundColor = Utils.hexToRGBA(backgroundColor, 0.9);
					}

					rule.style.color = textColor;
					rule.style["background-color"] = backgroundColor;
				});
			},
			changeFontSize(fontSize) {
				if (fontSize) {
					const lineHeight = this.getViewerForTab(this.currentTab).changeFontSize(fontSize, 0);
					
					this.$refs.fileViewer.forEach(fileViewer => {
						fileViewer.changeFontSize(fontSize, lineHeight);
					});
				}
			},
			getViewerForTab(tabId) {
				if (!this.$refs.fileViewer) {
					return undefined;
				}
				return this.$refs.fileViewer
						.find(viewer => viewer.$parent.value === tabId);
			},
			cursorTimestampChanged(timestamp, scrollOffset, cursorColumn, source) {
				if (source !== this.getViewerForTab(this.currentTab)) {
					return;
				}

				for (const viewer of this.$refs.fileViewer) {
					if (viewer !== source) {
						viewer.scrollToTimestamp(timestamp, scrollOffset, cursorColumn);
					}
				}
			}
		}
	}
</script>