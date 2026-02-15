import { App, Notice, PluginSettingTab, Setting } from 'obsidian'
import AutoPropertyPlugin from './main'

export interface AutoPropertyPluginSettings {
	autopropertySettings: AutoPropRule[]
	mode: 'modify' | 'active-leaf-change' | 'manual'
	showNotices: boolean
	pathsToIgnore: string[]
}

export interface AutoPropRule {
	key: string
	enabled: boolean
	rulePartOne: 'first' | 'all' | 'count'
	rulePartTwo: 'startsWith' | 'contains' | 'endsWith' | 'regex'
	ruleValue: string
	modifierWhitespace: 'trim' | 'noTrim'
	modifierOmitSearch: 'none' | 'omit'
	modifierCaseSensitive: 'sensitive' | 'insensitive'
	autoAdd: boolean
	rule: 'built' | 'created' | 'modified' | 'characterCount'
}

export const DEFAULT_SETTINGS: AutoPropertyPluginSettings = {
	autopropertySettings: [],
	mode: 'modify',
	showNotices: true,
	pathsToIgnore: []
}

export class AutoPropertiesSettingsTab extends PluginSettingTab {
	plugin: AutoPropertyPlugin

	constructor (app: App, plugin: AutoPropertyPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display (): void {
		const { containerEl } = this

		containerEl.empty()

		new Setting(containerEl)
			.setName('规则触发方式')
			.setDesc(
				"可在文件修改时、切换文件时触发，或仅通过“更新属性值”命令手动触发"
			)
			.addDropdown(dropdown => {
				dropdown.addOption('modify', '文件修改时')
				dropdown.addOption('active-leaf-change', '切换文件时')
				dropdown.addOption('manual', '仅命令手动触发')
				dropdown
					.setValue(this.plugin.settings.mode)
					.onChange(async value => {
						this.plugin.settings.mode = value as
							| 'modify'
							| 'active-leaf-change'
							| 'manual'
						await this.plugin.saveSettings()
					})
			})

		new Setting(containerEl)
			.setName('显示通知')
			.setDesc(
				'每次自动属性更新后显示通知。'
			)
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showNotices)
					.onChange(async value => {
						this.plugin.settings.showNotices = value
						await this.plugin.saveSettings()
					})
			})

		new Setting(containerEl)
			.setName('忽略路径')
			.setDesc(
				'这些路径中的文件不会处理自动属性。多个路径请用换行分隔。'
			)
			.addTextArea(text =>
				text
					.setPlaceholder('例如：resources/templates')
					.setValue(this.plugin.settings.pathsToIgnore.join('\n'))
					.onChange(async value => {
						this.plugin.settings.pathsToIgnore = value
							.split('\n')
							.map(path => path.trim())
						await this.plugin.saveSettings()
					})
			)

		let propertiesHeading = document.createElement('h2')
		propertiesHeading.innerText = '自动属性'
		propertiesHeading.addClass('my-head')
		containerEl.appendChild(propertiesHeading)

		this.plugin.settings.autopropertySettings.forEach((autoProp, index) => {
			// Inflate a panel for each auto-property registered in the settings
			containerEl.appendChild(
				this.createAutoPropertyPanel(autoProp, index)
			)
		})

		// button to create a new blank auto-property
		const addButton = document.createElement('button')
		addButton.setText('添加自动属性')
		addButton.addClass('my-button')
		addButton.onclick = async () => {
			this.plugin.settings.autopropertySettings.push({
				key: '',
				enabled: true,
				rulePartOne: 'first',
				rulePartTwo: 'startsWith',
				ruleValue: '',
				modifierWhitespace: 'trim',
				modifierOmitSearch: 'none',
				modifierCaseSensitive: 'insensitive',
				autoAdd: false,
				rule: 'built'
			})
			await this.plugin.saveSettings()
			this.display() // Refresh the settings tab to show the new property
		}
		containerEl.appendChild(addButton)
	}

	createAutoPropertyPanel (
		autoProp: AutoPropRule,
		index: number
	): HTMLElement {
		let wipAutoProp = {
			key: autoProp.key,
			enabled: autoProp.enabled,
			rulePartOne: autoProp.rulePartOne,
			rulePartTwo: autoProp.rulePartTwo,
			ruleValue: autoProp.ruleValue,
			modifierWhitespace: autoProp.modifierWhitespace,
			modifierOmitSearch: autoProp.modifierOmitSearch,
			modifierCaseSensitive: autoProp.modifierCaseSensitive,
			autoAdd: autoProp.autoAdd,
			rule: autoProp.rule
		}
		const panel = document.createElement('div')
		panel.addClass('property-panel')

		const header = document.createElement('h3')
		header.addClasses(['key-header', 'clickable'])
		header.setCssProps({ 'margin-bottom': '0px' })
		header.innerText = `${autoProp.key || '(未设置属性名)'}`
		panel.appendChild(header)

		const summary = document.createElement('span')
		let headerSummary = makeSummaryText(autoProp)
		summary.innerText = headerSummary
		if (header.innerText === '(未设置属性名)')
			summary.innerText = '- 自动属性尚未配置'
		summary.addClasses(['italic', 'clickable'])
		panel.appendChild(summary)

		const container = document.createElement('div')
		panel.appendChild(container)
		if (header.innerText !== '(未设置属性名)')
			container.setCssProps({ display: 'none' })

		function toggleContainer () {
			if (container.style.display === 'none') {
				container.setCssProps({ display: 'block' })
				summary.setCssProps({ display: 'none' })
			} else {
				container.setCssProps({ display: 'none' })
				summary.setCssProps({ display: 'inline-block' })
			}
		}
		header.onclick = toggleContainer
		summary.onclick = toggleContainer

		//this is used later, but declared here for scoping
		const saveButton = document.createElement('button')
		updateSaveButtonStatus()

		new Setting(container)
			.setName('属性名')
			.addText(text =>
				text
					.setValue(autoProp.key)
					.setPlaceholder('请输入属性名')
					.onChange(value => {
						wipAutoProp.key = value
						updateSaveButtonStatus()
					})
			)
			.setDesc('要应用规则的属性名称（key）。')
			.setClass('setting-key')

		const lineRulesContainer = document.createElement('div')
		lineRulesContainer.addClass('rules-container')

		new Setting(container).setName('规则').addDropdown(dropdown => {
			dropdown.addOption('built', '基于笔记正文行内容')
			dropdown.addOption('created', '文件创建时间')
			dropdown.addOption('modified', '文件修改时间')
			dropdown.addOption('characterCount', '笔记正文字符数')
			dropdown.setValue(wipAutoProp.rule)
			dropdown.onChange(value => {
				lineRulesContainer.setCssStyles({
					display: value === 'built' ? 'block' : 'none'
				})
				wipAutoProp.rule = value as
					| 'built'
					| 'created'
					| 'modified'
					| 'characterCount'
				updateSaveButtonStatus()
			})
		})

        if(wipAutoProp.rule !== 'built'){
			lineRulesContainer.setCssStyles({ display: 'none' })
        }
		container.appendChild(lineRulesContainer)

		new Setting(lineRulesContainer)
			.setName('条件')
			.addDropdown(dropdown => {
				dropdown.addOption('first', '提取第一行')
				dropdown.addOption('all', '提取所有行')
				dropdown.addOption('count', '统计行数')
				dropdown.setValue(wipAutoProp.rulePartOne).onChange(value => {
					wipAutoProp.rulePartOne = value as 'first' | 'all' | 'count'
					updateSaveButtonStatus()
				})
			})
			.addDropdown(dropdown => {
				dropdown.addOption('startsWith', '以...开头')
				dropdown.addOption('contains', '包含')
				dropdown.addOption('endsWith', '以...结尾')
				dropdown.addOption('regex', '匹配正则')
				dropdown.setValue(wipAutoProp.rulePartTwo).onChange(value => {
					wipAutoProp.rulePartTwo = value as
						| 'startsWith'
						| 'contains'
						| 'endsWith'
						| 'regex'
					updateSaveButtonStatus()
				})
			})
			.addText(text =>
				text
					.setPlaceholder('请输入规则匹配值')
					.setValue(autoProp.ruleValue)
					.onChange(value => {
						wipAutoProp.ruleValue = value
						// If regex expressions include the "\", remove them
						if (value.startsWith(`\\`) && value.endsWith(`\\`)) {
							wipAutoProp.ruleValue = value.slice(1, -1)
						}
						updateSaveButtonStatus()
					})
			)

		const modifiersSetting = new Setting(lineRulesContainer).setName(
			'修饰项'
		)

		const modifierContainer = document.createElement('div')

		modifiersSetting.controlEl.appendChild(modifierContainer)

		new Setting(modifierContainer)
			.setName('忽略空白字符')
			.addToggle(toggle => {
				toggle
					.setValue(wipAutoProp.modifierWhitespace == 'trim')
					.onChange(value => {
						if (value) {
							wipAutoProp.modifierWhitespace = 'trim'
						} else {
							wipAutoProp.modifierWhitespace = 'noTrim'
						}
					})
			})

		new Setting(modifierContainer)
			.setName('结果中去除搜索字符串')
			.addToggle(toggle => {
				toggle
					.setValue(wipAutoProp.modifierOmitSearch == 'omit')
					.onChange(value => {
						if (value) {
							wipAutoProp.modifierOmitSearch = 'omit'
						} else {
							wipAutoProp.modifierOmitSearch = 'none'
						}
					})
			})

		new Setting(modifierContainer)
			.setName('区分大小写')
			.addToggle(toggle => {
				toggle
					.setValue(wipAutoProp.modifierCaseSensitive == 'sensitive')
					.onChange(value => {
						if (value) {
							wipAutoProp.modifierCaseSensitive = 'sensitive'
						} else {
							wipAutoProp.modifierCaseSensitive = 'insensitive'
						}
					})
			})

		new Setting(container)
			.setName('自动添加属性到笔记')
			.setDesc(
				'当规则匹配时，自动将此属性添加到笔记。'
			)
			.addToggle(toggle => {
				toggle.setValue(wipAutoProp.autoAdd).onChange(value => {
					wipAutoProp.autoAdd = value
				})
			})

		new Setting(container).setName('启用').addToggle(toggle =>
			toggle.setValue(autoProp.enabled).onChange(value => {
				wipAutoProp.enabled = value
				updateSaveButtonStatus()
			})
		)

		const buttonContainer = document.createElement('div')
		buttonContainer.addClass('button-container')

		saveButton.setText('保存')
		saveButton.onclick = async () => {
			if (!wipAutoProp.key.trim()) {
				new Notice('属性名不能为空')
				return
			}
			if (!wipAutoProp.ruleValue.trim() && wipAutoProp.rule === 'built') {
				new Notice('基于正文行的规则，其搜索字符串不能为空')
				return
			}
			Object.assign(autoProp, wipAutoProp)
			await this.plugin.saveSettings()
			this.display()
			new Notice('自动属性已保存')
		}
		buttonContainer.appendChild(saveButton)

		const deleteButton = document.createElement('button')
		deleteButton.setText('删除')
		deleteButton.addClasses(['mod-warning', 'clickable'])
		deleteButton.onclick = async () => {
			this.plugin.settings.autopropertySettings.splice(index, 1)
			await this.plugin.saveSettings()
			this.display()
		}
		buttonContainer.appendChild(deleteButton)
		container.appendChild(buttonContainer)

		// Key setting
		return panel

		//#region --- Local Helper Functions

		function updateSaveButtonStatus () {
			saveButton.addClass('highlight')
		}

		function makeSummaryText (prop: AutoPropRule): string {
			if (!prop.enabled) return '- 自动属性未启用'

			const rulePartOneText = {
				first: '提取第一行',
				all: '提取所有行',
				count: '统计行数'
			}

			const rulePartTwoText = {
				startsWith: '以...开头',
				contains: '包含',
				endsWith: '以...结尾',
				regex: '匹配正则'
			}

			let text = `${rulePartOneText[prop.rulePartOne]} ${
				rulePartTwoText[prop.rulePartTwo]
			} "${prop.ruleValue}"`

			if (prop.rule === 'created') text = '文件创建时间'
			if (prop.rule === 'modified') text = '文件修改时间'
			if (prop.rule === 'characterCount') text = '笔记正文字符数'
			if (prop.autoAdd) text += '（➕ 已启用自动添加）'
			return text
		}

		//#endregion
	}
}
