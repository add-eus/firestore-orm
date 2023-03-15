import { useDebounceFn } from "@vueuse/core";
import EventEmitter from "events";
import type {
    CollectionReference,
    DocumentSnapshot,
    QueryConstraint,
} from "firebase/firestore";
import { limit, onSnapshot, query, startAfter } from "firebase/firestore";

/**
 * Check if an element exist in array from 0 to maxIndex number
 * @param array
 * @param maxIndex
 * @param item
 * @returns
 */
function isInArrayTo(array: any[], maxIndex: number, item: any): boolean {
    let flag = false;
    for (let i = 0; i < maxIndex && i < array.length && !flag; i++) {
        if (array[i].$isSame(item) === true) flag = true;
    }
    return flag;
}

class Queue {
    queue: Promise<any>[] = [];
    list: any[] = [];
    chunk: any[] = [];
    lastSnapshots: any[] = [];

    constructor(list: any[]) {
        this.list = list;
    }

    async add(
        callback: (startAfter: undefined | any, update: Function) => any
    ): Promise<any> {
        const chunkIndex = this.chunk.length;
        const waitPrevious = Promise.all(this.queue);
        let subCallback: Function | undefined;
        let lastSnapshotIndex = -1;

        if (this.chunk[chunkIndex] === undefined) this.chunk[chunkIndex] = [];

        const waitCurrent = new Promise((resolve, reject) => {
            subCallback = (previousItem: any) => {
                const onUpdate = useDebounceFn(
                    (list: any[], snapshots: DocumentSnapshot[]) => {
                        this.chunk[chunkIndex] = list;

                        const newList = [...this.list];

                        let index = 0;
                        // We replace all items in the queue with the new ones or existant
                        for (let iChunk = 0; iChunk < this.chunk.length; iChunk++) {
                            for (let iRow = 0; iRow < this.chunk[iChunk].length; iRow++) {
                                if (
                                    !isInArrayTo(newList, index, this.chunk[iChunk][iRow])
                                ) {
                                    newList[index] = this.chunk[iChunk][iRow];
                                    index++;
                                }
                            }
                        }
                        // Set length of array
                        newList.length = index;

                        // Clear end of array
                        while (index < newList.length || index < this.list.length) {
                            if (newList[index] !== undefined) delete newList[index];
                            index++;
                        }

                        this.list.splice(0, index, ...newList);

                        const snapshot = snapshots[snapshots.length - 1];
                        if (snapshot !== undefined) {
                            this.lastSnapshots[lastSnapshotIndex] = snapshot;
                        }

                        resolve(list);
                    },
                    33
                );
                callback(previousItem, onUpdate).then(undefined, reject);
            };
        });

        this.queue.push(waitCurrent);
        await waitPrevious;
        lastSnapshotIndex = this.lastSnapshots.length - 1;

        const previousLastSnapshot = this.lastSnapshots[lastSnapshotIndex];

        if (subCallback) subCallback(previousLastSnapshot);
        const result = await waitCurrent;
        const indexToRemove = this.queue.indexOf(waitCurrent);
        this.queue.splice(indexToRemove, 1);
        return result;
    }
}

export class Query extends EventEmitter {
    protected constraints: QueryConstraint[] = [];
    private transform: Function;
    private reference: CollectionReference;
    private indexes: number[] = [];
    public queue: Queue;

    constructor(
        constraints: QueryConstraint[],
        list: any[],
        transform: Function,
        reference: CollectionReference
    ) {
        super();
        this.constraints = constraints;
        this.transform = transform;
        this.reference = reference;
        this.queue = new Queue(list);
    }

    async next(
        sizeLimit: number | undefined,
        additionalConstraints: QueryConstraint[] = []
    ): Promise<DocumentSnapshot[]> {
        return this.queue.add(async (startAfterItem, update) => {
            const constraints = [...additionalConstraints, ...this.constraints];

            if (startAfterItem !== undefined) {
                constraints.push(startAfter(startAfterItem));
            }

            if (typeof sizeLimit === "number" && sizeLimit < 0) sizeLimit = undefined;

            if (sizeLimit) {
                constraints.push(limit(sizeLimit));
            }

            const q = query(this.reference, ...constraints);

            this.on(
                "destroy",
                onSnapshot(q, (snapshot) => {
                    void update(
                        snapshot.docs.map((doc) => {
                            const model = this.transform(doc);

                            return model;
                        }),
                        snapshot.docs
                    );
                })
            );
        });
    }

    destroy() {
        this.emit("destroy");
    }
}
