import type { Entity } from "./entity";
import type { DocumentReference, DocumentSnapshot } from "firebase/firestore";
import { getDoc, onSnapshot } from "firebase/firestore";
import EventEmitter from "events";

export class EntityMetaData extends EventEmitter {
    reference: DocumentReference | null = null;
    isFullfilled: boolean = false;
    isFullfilling: null | Promise<any> = null;
    origin: any = {};
    previousOrigin: any = {};
    properties: { [key: string]: any } = {};
    entity: Entity;
    unsuscribeSnapshot: Function | null = null;

    constructor(entity: any) {
        super();
        this.entity = entity;
        this.setMaxListeners(30);
    }

    destroy() {
        this.emit("destroy");
        if (this.unsuscribeSnapshot) this.unsuscribeSnapshot();
    }

    async refresh() {
        if (!this.reference) return;
        if (!this.isFullfilling) {
            this.isFullfilling = getDoc(this.reference).then(async (querySnapshot) => {
                this.entity.$setAndParseFromReference(querySnapshot);
            });
        }

        await this.isFullfilling;
    }

    async waitFullfilled() {
        return this.isFullfilling;
    }

    setReference(reference: DocumentReference) {
        this.reference = reference;
        if (this.unsuscribeSnapshot) this.unsuscribeSnapshot();
        let isFirstFetch = true;
        this.unsuscribeSnapshot = onSnapshot(
            this.reference,
            (document: DocumentSnapshot) => {
                if (isFirstFetch) {
                    isFirstFetch = false;
                    return;
                }
                const data = document.data();

                if (data === undefined) return;
                this.emit("parse", data);
            }
        );
        this.on("destroy", () => {
            this.unsuscribeSnapshot?.();
        });
    }
}
