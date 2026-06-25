import { sam }          from './sam'
import { dibbs }        from './dibbs'
import { texas }        from './texas'
import { houston }      from './houston'
import { harrisCounty } from './harris-county'
import type { ProcurementConnector } from '../connector'

export { sam, dibbs, texas, houston, harrisCounty }
export const ALL_CONNECTORS: ProcurementConnector[] = [dibbs, sam, texas, houston, harrisCounty]
