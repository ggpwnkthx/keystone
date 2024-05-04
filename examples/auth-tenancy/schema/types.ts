import { SelectFieldConfig } from '@keystone-6/core/fields'
import { BaseListTypeInfo, KeystoneContext } from "@keystone-6/core/types";

export type Session = {
    itemId: string;
    data: {
      name: string;
      email: string;
    };
  };
  
  export type Context = {
    session?: Session;
    context: KeystoneContext;
  };
  
  export type Ops = "C" | "R" | "U" | "D";
  
  export const Operations: SelectFieldConfig<BaseListTypeInfo> = {
    type: "enum",
    options: [
      { label: "Create", value: "C" },
      { label: "Read", value: "R" },
      { label: "Update", value: "U" },
      { label: "Delete", value: "D" },
    ],
  };