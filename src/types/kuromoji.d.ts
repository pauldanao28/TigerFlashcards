// Minimal types for the parts of kuromoji (no bundled typings) that we use.
declare module "kuromoji" {
  export interface IpadicFeatures {
    surface_form: string;
    pos: string;
    pos_detail_1: string;
    basic_form: string;
    reading?: string;
  }
  export interface Tokenizer {
    tokenize(text: string): IpadicFeatures[];
  }
  export function builder(options: { dicPath: string }): {
    build(callback: (err: Error | null, tokenizer: Tokenizer) => void): void;
  };
}
