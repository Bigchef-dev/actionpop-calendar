// Minimal type declarations for ical.js (no official @types package)
declare module 'ical.js' {
  interface IcalProperty {
    readonly name: string;
    getFirstValue(): unknown;
    getValues(): unknown[];
    getParameter(name: string): string | null;
  }

  interface IcalComponent {
    getAllSubcomponents(name: string): IcalComponent[];
    getFirstProperty(name: string): IcalProperty | null;
    getFirstPropertyValue(name: string): unknown;
    getAllProperties(): IcalProperty[];
  }

  function parse(icsText: string): unknown;

  class Component {
    constructor(jCal: unknown);
    getAllSubcomponents(name: string): IcalComponent[];
    getFirstProperty(name: string): IcalProperty | null;
    getFirstPropertyValue(name: string): unknown;
    getAllProperties(): IcalProperty[];
  }

  export { parse, Component };
}
