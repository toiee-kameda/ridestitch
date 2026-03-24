// src/main.ts
import './style.css'
import { setLang } from './i18n'
import { getState } from './state'
import { render } from './ui'

const { lang } = getState()
setLang(lang)
render()
