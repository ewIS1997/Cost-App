import { COLUMN_DEFINITIONS } from './columns.js'

export const DATABASE_NAME = 'boq-cost-load-react'
export const DATABASE_SCHEMA_VERSION = 6
export const ASSEMBLY_NAME_LIMIT = 100
export const ASSEMBLY_LINE_LIMIT = 10000
export const ROW_LIMIT = 10000
export const FILL_CELL_LIMIT = 50000
export const SHEET_LIMIT = 100
export const HISTORY_ENTRY_LIMIT = 20
export const HISTORY_BYTE_LIMIT = 24 * 1024 * 1024
export const PROJECT_NAME_LIMIT = 100
export const SHEET_NAME_LIMIT = 60
export const BOQ_CODE_LIMIT = 100
export const RESOURCE_LIMIT = 500
export const UNIT_LIMIT = 100
export const REMARK_LIMIT = 1000
export const NUMERIC_ABSOLUTE_LIMIT = 1e12
export const JSON_BACKUP_LIMIT = 100 * 1024 * 1024
export const EXCEL_IMPORT_LIMIT = 25 * 1024 * 1024
export const COLUMN_WIDTH_MIN = 72
export const COLUMN_WIDTH_MAX = 480
export const DEFAULT_COLUMN_WIDTHS = Object.freeze(COLUMN_DEFINITIONS.map((column) => column.defaultWidth))
export const DEFAULT_FILTER = Object.freeze({ search: '', condition: '', conditionValue: '', conditionValue2: '', selected: null })
