import { reactive } from "vue";
import { onInitialize } from "./entity";
import type { EntityMetaData } from "./entityMetadata";

export function Input(type: any, options: any = {}) {
    return function (target: any, name: string) {
        onInitialize(target, function (this: any, metadata: EntityMetaData) {
            if (metadata.properties[name] === undefined)
                metadata.properties[name] = reactive({});
            metadata.properties[name].input = {
                type,
                validation: [],
                attrs: options,
                errors: [],
            };
        });
    };
}
