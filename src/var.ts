import moment from "moment-with-locales-es6";
import { GeoPoint } from "firebase/firestore";
import { useDoc } from "./index";
import { Entity, EntityBase } from "./entity";
import { onInitialize, isEntityClass, isEntityStandaloneClass } from "./entity";
import type { EntityMetaData } from "./entityMetadata";
import { reactive } from "vue";

function parseData(toTransform: any | any[], type: any): any {
    if (typeof toTransform === "undefined") return undefined;
    if (toTransform === null) return null;
    if (Array.isArray(type)) {
        if (!Array.isArray(toTransform)) return [];
        return toTransform.map((data) => {
            return parseData(data, type[0]);
        });
    } else if (type === moment && moment.isMoment(toTransform) === false) {
        return moment.unix(toTransform.seconds);
    } else if (type === GeoPoint) {
        return new GeoPoint(toTransform._lat, toTransform._long);
    } else if (isEntityStandaloneClass(type) && typeof toTransform === "string") {
        const model = useDoc(type, toTransform, { fetch: false });
        const childMetadata = model.$getMetadata();

        childMetadata.on("get", (name: string) => {
            if (
                childMetadata.isFullfilled === false &&
                typeof name === "string" &&
                !name.startsWith("$") &&
                name !== "constructor"
            ) {
                childMetadata.refresh();
            }
        });
        return model;
    } else if (isEntityClass(type)) {
        const o = new type();
        o.$getMetadata().emit("parse", toTransform);
        return o;
    }
    return toTransform;
}

function formatData(toTransform: any | any[], type: any, forceAll: boolean = false): any {
    if (typeof toTransform === "undefined") return undefined;
    if (toTransform === null) return null;
    if (Array.isArray(type)) {
        if (!Array.isArray(toTransform)) return [];
        return toTransform.map((data) => {
            return formatData(data, type[0]);
        });
    } else if (type === moment) {
        return toTransform.toDate();
    } else if (type === GeoPoint) {
        return toTransform;
    } else if (isEntityStandaloneClass(type)) {
        return toTransform.$getID();
    } else if (isEntityClass(type)) {
        const raw = {};
        toTransform.$getMetadata().emit("format", raw, true);
        return raw;
    } else if (typeof type === "function" && /^\s*class\s+/.test(type.toString())) {
        const raw: { [key: string]: any } = {};
        Object.getOwnPropertyNames(toTransform).forEach((key) => {
            raw[key] = formatData(
                toTransform[key],
                toTransform[key].constructor,
                forceAll
            );
        });
        return raw;
    }
    return toTransform;
}

function isEqual(a: any, b: any, type: any): boolean {
    if (Array.isArray(type) && Array.isArray(a)) {
        return a.every((row: any, index: number) => {
            if (b === undefined && type[0] !== undefined) return false;
            return isEqual(row, b[index], type[0]);
        });
    } else if (
        type === moment &&
        moment.isMoment(a) === true &&
        moment.isMoment(b) === true
    ) {
        return a.isSame(b);
    } else if (isEntityClass(type)) {
        return isEntityStandaloneClass(a) && isEntityStandaloneClass(b) && a.$isSame(b);
    }
    return a === b;
}

export function Var(type: any) {
    return function (target: EntityBase, name: string) {
        onInitialize(target, function (this: any, metadata: EntityMetaData) {
            if (metadata.properties[name] === undefined)
                metadata.properties[name] = reactive({});

            let isChanged: boolean = false;
            const thisTarget = this;
            Object.defineProperty(metadata.properties[name], "isChanged", {
                get() {
                    if (
                        typeof thisTarget[name] === "object" &&
                        thisTarget[name] instanceof EntityBase &&
                        !(thisTarget[name] instanceof Entity)
                    )
                        return thisTarget[name].$hasChanged();
                    else if (Array.isArray(thisTarget[name])) {
                        return thisTarget[name].some((row: any) => {
                            if (
                                row instanceof EntityBase &&
                                !(thisTarget[name] instanceof Entity)
                            )
                                return row.$hasChanged();
                            return false;
                        });
                    }
                    return isChanged;
                },
            });
            metadata.properties[name].isInitialized = false;

            this[name] = parseData(this[name], type);

            let originalPropertyValue: any = this[name];

            metadata.on("set", (key, value) => {
                if (key === name) {
                    isChanged = !isEqual(value, originalPropertyValue, type);
                }
            });

            // const unwatch = watch(
            //     () => this[name],
            //     () => {
            //         isChanged = !isEqual(this[name], originalPropertyValue, type);
            //     }
            // );

            metadata.on("parse", (raw: any) => {
                if (isChanged) return;
                const parsed = parseData(raw[name], type);

                if (parsed !== this[name]) this[name] = parsed;
                originalPropertyValue = this[name];
                metadata.properties[name].isInitialized = true;
                isChanged = false;
            });

            metadata.on("format", (raw: any, forceAll = false) => {
                if (
                    forceAll === false &&
                    metadata.reference &&
                    metadata.properties[name].isChanged === false
                )
                    return;
                const rawValue = formatData(this[name], type, forceAll);

                if (typeof rawValue !== "undefined") raw[name] = rawValue;
            });

            metadata.on("saved", () => {
                originalPropertyValue = this[name];
                isChanged = false;
            });

            // metadata.on("destroy", () => {

            // });
        });
    };
}
