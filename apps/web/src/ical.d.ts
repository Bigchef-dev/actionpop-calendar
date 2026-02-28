// Minimal type declarations for ical.js (no official @types package)
declare module 'ical.js' {
  interface IcalValue {
    toJSDate(): Date
    isDate: boolean
  }

  interface IcalProperty {
    getFirstValue(): IcalValue | null
  }

  interface IcalComponent {
    getAllSubcomponents(name: string): IcalComponent[]
    getFirstPropertyValue(name: string): string | null
    getFirstProperty(name: string): IcalProperty | null
  }

  function parse(icsText: string): unknown

  class Component {
    constructor(jCal: unknown)
    getAllSubcomponents(name: string): IcalComponent[]
  }

  export { parse, Component }
}
