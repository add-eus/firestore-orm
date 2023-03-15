import {
    DocumentReference,
    DocumentSnapshot,
    deleteDoc,
    collection,
    doc,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { markRaw, shallowReactive } from "vue";
import { useFirebase } from "./firebase";
import { EntityMetaData } from "./entityMetadata";

export function onInitialize(target: any, callback: Function) {
    const constructor = target.constructor;
    if (constructor.onInitialize === undefined) constructor.onInitialize = [];
    constructor.onInitialize.push(callback);
}

export function isEntityClass(entityClass: any): boolean {
    return entityClass.prototype instanceof EntityBase;
}

export function isEntityStandaloneClass(entityClass: any) {
    return entityClass.prototype instanceof Entity;
}

export function isEntity(entity: any) {
    if (typeof entity === "object" && entity !== null)
        return isEntityClass(entity.constructor);
    return false;
}

export class EntityBase {
    constructor() {
        const constructor = this.constructor as typeof EntityBase;

        const reactivity = new Proxy(shallowReactive(this), {
            get(obj, key: string) {
                obj.$getMetadata().emit("get", key);
                return (obj as any)[key];
            },
            set(obj: { [key: string]: any }, key: string, value: any) {
                obj[key] = value;
                obj.$getMetadata().emit("set", key, value);
                return true;
            },
        });

        const $metadata = markRaw(new EntityMetaData(this));

        Object.defineProperty(this, "$metadata", {
            value: $metadata,
            configurable: false,
            enumerable: false,
            writable: false,
        });

        if (Array.isArray((constructor as any).onInitialize)) {
            (constructor as any).onInitialize.map((callback: Function) => {
                return callback.call(reactivity, this.$getMetadata());
            });
        }

        return reactivity;
    }

    static addMethod(name: string, callback: Function) {
        (this.prototype as any)["$" + name] = callback;
    }

    $getMetadata(): EntityMetaData {
        return (this as any).$metadata;
    }

    $hasChanged() {
        const $metadata = this.$getMetadata();
        return Object.values($metadata.properties).some(
            (property: any) => property.isChanged
        );
    }

    $reset() {
        if (!this.$getMetadata().reference) throw new Error("No original data to reset");
        Object.values(this.$getMetadata().properties).forEach(
            (property: any) => (property.isChanged = false)
        );
        this.$getMetadata().emit("parse", this.$getMetadata().origin);
        this.$getMetadata().isFullfilled = true;
    }

    $getPlain() {
        const raw = {};
        this.$getMetadata().emit("format", raw);
        return raw;
    }
}

export class Entity extends EntityBase {
    static collectionName: string;

    $setAndParseFromReference(querySnapshot: DocumentReference | DocumentSnapshot) {
        if (querySnapshot instanceof DocumentReference) {
            this.$getMetadata().setReference(querySnapshot);
        } else if (querySnapshot instanceof DocumentSnapshot) {
            this.$getMetadata().setReference(querySnapshot.ref);
            this.$getMetadata().previousOrigin = this.$getMetadata().origin =
                querySnapshot.data();

            this.$getMetadata().emit("parse", this.$getMetadata().origin);

            this.$getMetadata().isFullfilled = true;
        }
    }

    static addMethod(name: string, callback: Function) {
        (this.prototype as any)["$" + name] = callback;
    }

    $getID() {
        const metadata = this.$getMetadata()
        if (metadata.reference === null) return;
        return metadata.reference.id;
    }

    $isNew() {
        return this.$getID() === "" || this.$getID() === undefined;
    }

    $isSame(other: any) {
        if (
            this.$getMetadata() === undefined ||
            this.$getMetadata().reference === undefined
        )
            return false;
        if (
            other.$getMetadata() === undefined ||
            other.$getMetadata().reference === undefined
        )
            return false;
        return (
            this.$getMetadata().reference?.path === other.$getMetadata().reference.path
        );
    }

    async $save() {
        const constructor = this.constructor as typeof Entity;

        const raw = this.$getPlain();
        const $metadata = this.$getMetadata();

        try {
            if ($metadata.reference === null) {
                const firebase = useFirebase() as any;
                const docRef = doc(
                    collection(firebase.firestore, constructor.collectionName)
                );
                $metadata.setReference(docRef);
                await setDoc(docRef, raw);
            } else if (Object.keys(raw).length > 0 && $metadata.reference !== null) {
                await updateDoc($metadata.reference, raw);
            }
            $metadata.previousOrigin = $metadata.origin;
            $metadata.origin = raw;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            throw err;
        }
        this.$getMetadata().emit("saved");
    }

    async $delete() {
        const metadata = this.$getMetadata()
        if (metadata.reference) await deleteDoc(metadata.reference);
        metadata.destroy();
    }

    $getPlainForLogs() {
        return {
            docName: (this.constructor as typeof Entity).collectionName.replace(/s$/, ""),
            uid: this.$getID(),
            ...this.$getPlain(),
        };
    }

    $getModelName() {
        return (this.constructor as typeof Entity).collectionName.replace(/s$/, "");
    }
}
