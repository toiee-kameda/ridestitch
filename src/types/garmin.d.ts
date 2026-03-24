declare module '@garmin/fitsdk' {
  export interface DecodeOptions {
    convertDateTimesToDates?: boolean;
    convertTypesToStrings?: boolean;
    applyScaleAndOffset?: boolean;
    expandSubFields?: boolean;
    expandComponents?: boolean;
    mergeHeartRates?: boolean;
  }

  export interface DecodeResult {
    messages: Record<string, unknown[]>;
    errors: string[];
  }

  export class Decoder {
    constructor(stream: Stream);
    read(options?: DecodeOptions): DecodeResult;
  }

  export class Encoder {
    constructor();
    onMesg(mesgNum: number, mesg: object): void;
    close(): Uint8Array;
  }

  export class Stream {
    constructor(data?: any);
    static fromArrayBuffer(buffer: ArrayBufferLike): Stream;
    getBytes(): Uint8Array;
  }

  export const Profile: {
    MesgNum: {
      FILE_ID: number;
      DEVICE_INFO: number;
      MANUFACTURER: number;
      PRODUCT: number;
      FILE_CAPABILITIES: number;
      EVENT: number;
      DEVICE_SETTINGS: number;
      USER_PROFILE: number;
      HRM_PROFILE: number;
      SDM_PROFILE: number;
      BIKE_PROFILE: number;
      CONNECTIVITY: number;
      WATCHFACE_SETTINGS: number;
      OHR_SETTINGS: number;
      ZONES_TARGET: number;
      SPORT: number;
      SOURCE: number;
      WEIGHT_SCALE: number;
      BLOOD_PRESSURE: number;
      MONITORING: number;
      GOAL: number;
      ACTIVITY: number;
      SESSION: number;
      LAP: number;
      LENGTH: number;
      RECORD: number;
      EVENT_UI: number;
      DEVICE_INFO_MESG: number;
      [key: string]: number;
    };
    [key: string]: any;
  };

  export function createFitFile(fitData: Uint8Array): any;
  export function createActivityFile(fitFile: any): any;
  export const Mesg: any;
  export const Field: any;
  export const MesgNum: any;
  export const SubMesgNum: any;
  export const FieldNum: any;
  export const DateTime: any;
  export function setValueAtKey(obj: any, key: string, value: any): void;
  export function cloneActivity(activity: any): any;
  export const CombinedMesgFields: any;
}
