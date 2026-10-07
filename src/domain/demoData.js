import { createBlankRow, createBlankWorksheet, createId } from './normalization.js'

const line = (boqCode, resource, unit, cqbi, cr, rate, options = {}) => ({
  ...createBlankRow(),
  boqCode,
  resource,
  unit,
  cqbi,
  cr,
  rate,
  override: options.override ?? null,
  boqQty: options.boqQty ?? null,
  remark: options.remark ?? '',
})

function worksheet(lines) {
  const data = createBlankWorksheet()
  data.rows = lines
  return data
}

export function createDemoSheets(projectId, timestamp) {
  const buildingWorks = {
    name: 'Building Works',
    data: worksheet([
      line('A.01', 'Site clearance and strip topsoil', 'm²', 1, 1, 2.8, { boqQty: 420, remark: 'Clear building footprint and immediate work area.' }),
      line('A.02', 'Excavate foundation trenches in ordinary soil', 'm³', 1, 1, 12.5, { boqQty: 68, remark: 'Average trench depth 1.2 m; exclude rock.' }),
      line('A.03', 'Cart away surplus excavated material', 'm³', 1, 1, 8.4, { boqQty: 34, remark: 'Assumed 8 km disposal haul.' }),
      line('B.01', 'Hardcore fill, supply and place', 'm³', 1, 1, 39, { boqQty: 31, remark: 'Compacted below ground floor slab.' }),
      line('B.01', 'Mechanical compaction to hardcore', 'm²', 1, 1, 2.4, { boqQty: 250, remark: 'Measured to ground floor area; intentionally different unit and quantity from fill.' }),
      line('B.02', 'Sand blinding below slab', 'm²', 1, 1, 1.8, { boqQty: 250 }),
      line('B.03', 'Damp-proof membrane, 1000 gauge', 'm²', 1.08, 1, 2.2, { boqQty: 250, remark: '8% laps and wastage allowance.' }),
      line('C.01', 'Reinforced concrete strip foundations, grade 25', 'm³', 1, 1, 148, { boqQty: 24, remark: 'Concrete supply; reinforcement measured separately.' }),
      line('C.01', 'High-yield reinforcement to strip foundations', 'kg', 1, 1, 1.25, { boqQty: 1850, remark: 'Bar schedule not issued; preliminary 77 kg/m³ allowance.' }),
      line('C.01', 'Formwork to foundation sides', 'm²', 1, 1, 18, { boqQty: 78 }),
      line('C.02', 'Ground floor concrete slab, 125 mm thick', 'm³', 1, 1, 152, { boqQty: 31.25, remark: '250 m² gross floor area at 125 mm.' }),
      line('C.02', 'A142 mesh reinforcement to floor slab', 'm²', 1.05, 1, 6.8, { boqQty: 250, remark: '5% lap allowance; mesh supply and fixing.' }),
      line('D.01', '200 mm concrete block external walls', 'm²', 1, 1, 31, { boqQty: 286, remark: 'Net of major openings.' }),
      line('D.01', 'Cement-sand mortar to external blockwork', 'm³', 0.025, 1, 188, { boqQty: 286, remark: 'Mortar consumption allowance per m² of wall.' }),
      line('D.01', 'Blocklayer and assistant', 'm²', 1, 1, 13.5, { boqQty: 286, remark: 'Labour measured to same wall area.' }),
      line('D.02', '100 mm concrete block internal partitions', 'm²', 1, 1, 22, { boqQty: 318 }),
      line('D.03', 'Internal and external cement-sand plaster', 'm²', 1, 1, 8.2, { boqQty: 980, remark: 'Combined wall-face allowance; verify against elevations.' }),
      line('E.01', 'Lightweight steel roof trusses and bracing', 'm²', 1.12, 1, 42, { boqQty: 278, remark: 'Roof plan area includes 12% pitch and eaves allowance.' }),
      line('E.02', 'Pre-painted long-run metal roof sheets', 'm²', 1.1, 1, 18.5, { boqQty: 278, remark: '10% side laps and cutting allowance.' }),
      line('E.03', 'Metal fascia, gutters and downpipes', 'm', 1, 1, 16.8, { boqQty: 92 }),
      line('F.01', 'Porcelain floor tiles, supply', 'm²', 1, 1, 26, { boqQty: 172, remark: 'Supply quantity includes 8% cutting and wastage over the 159 m² net tiled area.' }),
      line('F.01', 'Tile adhesive and grout', 'm²', 1, 1, 5.8, { boqQty: 159, remark: 'Net tiled area; quantity differs from tile supply because supply includes wastage.' }),
      line('F.01', 'Tile installation labour', 'm²', 1, 1, 11.5, { boqQty: 159 }),
      line('F.02', 'Non-slip ceramic tiles to washrooms', 'm²', 1.08, 1, 28, { boqQty: 24 }),
      line('F.03', 'Internal emulsion paint, two coats', 'm²', 1, 1, 3.6, { boqQty: 1010, remark: 'Prepared plaster surfaces; two finish coats.' }),
      line('F.04', 'Solid-core timber doors and ironmongery', 'nr', 1, 1, 245, { boqQty: 12 }),
      line('F.05', 'Powder-coated aluminium windows and glazing', 'm²', 1, 1, 185, { boqQty: 34, remark: 'Final sizes subject to approved window schedule.' }),
    ]),
  }

  const mepWorks = {
    name: 'MEP Works',
    data: worksheet([
      line('M.01', 'Main distribution board, complete', 'nr', 1, 1, 980, { boqQty: 1 }),
      line('M.02', 'PVC conduit and wiring to lighting points', 'point', 1, 1, 28, { boqQty: 48 }),
      line('M.03', 'LED panel light, supply and installation', 'nr', 1, 1, 72, { boqQty: 28, override: 0, remark: 'Client-supplied fittings; zero cost retained to demonstrate valid zero override.' }),
      line('M.04', 'External LED security light', 'nr', 1, 1, 64, { boqQty: 8 }),
      line('M.05', 'Twin socket outlet, wired and installed', 'nr', 1, 1, 39, { boqQty: 32 }),
      line('M.06', 'Earthing and bonding installation', 'item', 1, 1, 420, { boqQty: 1 }),
      line('M.07', 'Electrical testing and certification', 'item', 1, 1, 360, { boqQty: 1 }),
      line('P.01', 'Cold water distribution pipework, 20–32 mm', 'm', 1, 1, 12.8, { boqQty: 146 }),
      line('P.02', 'Soil and waste pipework, 50–110 mm', 'm', 1, 1, 16.5, { boqQty: 78 }),
      line('P.03', 'Close-coupled WC suite, supply and install', 'nr', 1, 1, 285, { boqQty: 4 }),
      line('P.04', 'Wash hand basin with tap and bottle trap', 'nr', 1, 1, 168, { boqQty: 5 }),
      line('P.05', 'Accessible grab rails and bathroom accessories', 'set', 1, 1, 210, { boqQty: 1 }),
      line('P.06', 'Water storage tank, 2,000 litre', 'nr', 1, 1, null, { boqQty: 1, remark: 'Supplier quotation pending; rate intentionally left blank for estimator review.' }),
      line('P.07', 'Pressure testing, flushing and commissioning', 'item', 1, 1, 320, { boqQty: 1 }),
    ]),
  }

  const preliminaries = {
    name: 'Preliminaries',
    data: worksheet([
      line('PR.01', 'Mobilization, site setup and demobilization', 'item', 1, 1, 3200, { boqQty: 1, remark: 'Fictional sample: approx. 250 m² single-storey community centre, eight-month duration. All rates are illustrative, not supplier quotations.' }),
      line('PR.02', 'Project manager', 'month', 1, 1, 2450, { boqQty: 8 }),
      line('PR.03', 'Site supervisor', 'month', 1, 1, 1780, { boqQty: 8 }),
      line('PR.04', 'Temporary site office and storage', 'month', 1, 1, 620, { boqQty: 8 }),
      line('PR.05', 'Temporary water and power', 'month', 1, 1, 280, { boqQty: 8 }),
      line('PR.06', 'Health, safety and environmental provision', 'month', 1, 1, 195, { boqQty: 8 }),
      line('PR.07', 'Contractor all-risk insurance', 'item', 1, 1, 1850, { boqQty: 1, remark: 'Provisional allowance; obtain insurer quotation before tender.' }),
      line('PR.08', 'Testing, handover documents and as-built drawings', 'item', 1, 1, 780, { boqQty: 1 }),
      line('PR.09', 'Weather protection and temporary works allowance', 'item', 1, 1, 900, { boqQty: 1, override: 1100, remark: 'Estimator override applied to provisional allowance; confirm after construction sequence review.' }),
      line('PR.10', 'Final cleaning and practical completion', 'item', 1, 1, 560, { boqQty: null, remark: 'Confirm duration and extent of handover cleaning; quantity intentionally left blank.' }),
    ]),
  }

  return [buildingWorks, mepWorks, preliminaries].map(({ name, data }, position) => ({
    id: createId(),
    projectId,
    name,
    position,
    data,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}
