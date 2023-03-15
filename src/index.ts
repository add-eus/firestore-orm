import { watch, isRef, shallowReactive, onScopeDispose, getCurrentScope } from "vue";
import algoliasearch from "algoliasearch";
import type {
    WhereFilterOp,
    QueryConstraint,
    OrderByDirection,
    DocumentSnapshot,
    DocumentReference,
} from "firebase/firestore";
import { where, orderBy, collection, doc } from "firebase/firestore";
import { useFirebase } from "./firebase";
import { until } from "@vueuse/core";
import { Query } from "./query";
import { QuerySearch } from "./querySearch";
import type { Entity } from "./entity";

export { Input } from "./input";
export { Entity, EntityBase } from "./entity";
export { Var } from "./var";

const cachedEntities: { [key: string]: { usedBy: number; entity: any } } = {};
const algoliaClient = algoliasearch(
    (import.meta as any).env.VITE_ALGOLIA_APPLICATION_ID,
    (import.meta as any).env.VITE_ALGOLIA_API_KEY
);

function transformWheres(whereOptions: [] = []): QueryConstraint[] {
    return whereOptions.map((whereOption: [string, WhereFilterOp, any]) => {
        return where(...whereOption);
    });
}

function transformOrders(orderOptions: [] = []): QueryConstraint[] {
    return orderOptions.map((orderOption: [string, OrderByDirection]) => {
        return orderBy(...orderOption);
    });
}

export class Collection<T> extends Array<T> {
    isUpdating: boolean = false;
    async fetched() {
        return until(() => {
            return this.isUpdating;
        }).toBe(false);
    }
}

/**
 * Get an updated collection from firestore
 *
 * @param collectionModel Entity A Model declared in src/models
 * @param options any An options of refs
 * @returns ref<any[]>
 */
export function useCollection<T extends typeof Entity>(
    collectionModel: T,
    options: any
): Collection<InstanceType<T>> {
    const onDestroy: (() => void)[] = [];
    getCurrentScope()
        ? onScopeDispose(() => {
              onDestroy.forEach((callback) => callback());
          })
        : void 0;
    const entities = shallowReactive<any>(new Collection());
    const firebase = useFirebase() as any;
    const algoliaIndex = algoliaClient.initIndex(
        (import.meta as any).env.PROD
            ? collectionModel.collectionName
            : `dev_${collectionModel.collectionName}`
    );

    const collectionRef = collection(firebase.firestore, collectionModel.collectionName);

    entities.isUpdating = true;

    let wheres: QueryConstraint[] = transformWheres(
        isRef(options.wheres) ? options.wheres.value : options.wheres
    );
    let orders: QueryConstraint[] = transformOrders(
        isRef(options.orders) ? options.orders.value : options.orders
    );
    let search: string = isRef(options.search) ? options.search.value : options.search;

    let query: Query | QuerySearch | null;

    async function fetch() {
        entities.splice(0, entities.length);
        if (query) query.destroy();

        if (search && search.length > 0) {
            query = new QuerySearch(
                [...wheres, ...orders],
                entities,
                (doc: DocumentSnapshot) => {
                    return transform(doc, collectionModel, (callback) => {
                        onDestroy.push(callback);
                    });
                },
                collectionRef,
                search,
                algoliaIndex
            );
        } else {
            query = new Query(
                [...wheres, ...orders],
                entities,
                (doc: DocumentSnapshot) => {
                    return transform(doc, collectionModel, (callback) => {
                        onDestroy.push(callback);
                    });
                },
                collectionRef
            );
        }

        entities.isUpdating = true;

        let limit = 10;
        if (isRef(options.limit) && typeof options.limit.value === "number")
            limit = options.limit.value;
        else if (typeof options.limit === "number") limit = options.limit;
        if (limit === 0) return;

        try {
            await query.next(limit);
            entities.isUpdating = false;
        } catch (err) {
            entities.isUpdating = false;
            throw err;
        }
    }

    if (isRef(options.wheres))
        watch(options.wheres, () => {
            wheres = transformWheres(options.wheres.value);
            // eslint-disable-next-line no-console
            fetch().catch(console.error);
        });

    if (isRef(options.orders))
        watch(options.orders, () => {
            orders = transformOrders(options.orders.value);
            // eslint-disable-next-line no-console
            fetch().catch(console.error);
        });

    if (isRef(options.limit))
        watch(options.limit, async (newLimit: number, oldLimit: number) => {
            if (!query) return;
            const limit = newLimit - oldLimit;
            if (limit <= 0) return;
            entities.isUpdating = true;
            await query.next(limit);
            entities.isUpdating = false;
        });

    if (isRef(options.search))
        watch(options.search, async () => {
            search = options.search.value;
            await fetch();
        });

    fetch().catch(() => {});

    return entities;
}

export function useDoc<T extends typeof Entity>(
    collectionModel: T,
    id?: string,
    options = { fetch: true }
): InstanceType<T> {
    if (id === undefined) return newDoc(collectionModel);
    const { firestore } = useFirebase() as any;
    const reference = doc(collection(firestore, collectionModel.collectionName), id);
    const model = transform(
        reference,
        collectionModel,
        getCurrentScope() ? onScopeDispose : () => {}
    );

    if (options.fetch) void model.$getMetadata().refresh();
    return model;
}

export function newDoc<T extends typeof Entity>(collectionModel: T): InstanceType<T> {
    const entity = new collectionModel();

    (getCurrentScope() ? onScopeDispose : () => {})(() => {
        const cachedIdEntity = `${collectionModel.collectionName}/${entity.$getID()}`;
        if (cachedEntities[cachedIdEntity] === undefined) return;
        cachedEntities[cachedIdEntity].usedBy--;
        if (cachedEntities[cachedIdEntity].usedBy === 0) {
            cachedEntities[cachedIdEntity].entity.$getMetadata().destroy();
            delete cachedEntities[cachedIdEntity];
        }
    });

    entity.$getMetadata().on("saved", () => {
        const cachedIdEntity = `${collectionModel.collectionName}/${entity.$getID()}`;
        if (cachedEntities[cachedIdEntity] !== undefined) {
            cachedEntities[cachedIdEntity] = {
                usedBy: 1,
                entity,
            };
        }
    });
    return entity as any;
}

export async function findDoc<T extends typeof Entity>(
    collectionModel: T,
    options: any
): Promise<InstanceType<T> | undefined> {
    const wheres: QueryConstraint[] = transformWheres(
        isRef(options.wheres) ? options.wheres.value : options.wheres
    );
    const orders: QueryConstraint[] = transformOrders(
        isRef(options.orders) ? options.orders.value : options.orders
    );
    const search: string = isRef(options.search) ? options.search.value : options.search;

    let query: Query | QuerySearch | null;

    const entities: any[] = [];
    const firebase = useFirebase() as any;

    const collectionRef = collection(firebase.firestore, collectionModel.collectionName);

    const onDestroy: (() => void)[] = [];
    onScopeDispose(() => {
        onDestroy.forEach((callback) => callback());
    });

    if (search && search.length > 0) {
        const algoliaIndex = algoliaClient.initIndex(
            (import.meta as any).env.PROD
                ? collectionModel.collectionName
                : `dev_${collectionModel.collectionName}`
        );
        query = new QuerySearch(
            [...wheres, ...orders],
            entities,
            (doc: DocumentSnapshot) => {
                return transform(doc, collectionModel, (callback) => {
                    onDestroy.push(callback);
                });
            },
            collectionRef,
            search,
            algoliaIndex
        );
    } else {
        query = new Query(
            [...wheres, ...orders],
            entities,
            (doc: DocumentSnapshot) => {
                return transform(doc, collectionModel, (callback) => {
                    onDestroy.push(callback);
                });
            },
            collectionRef
        );
    }
    const docs = await query.next(1);
    if (docs.length <= 0) return;
    return docs[0] as any;
}

/**
 * Transform a document to an entity and cache it
 * @param doc DocumentReference or DocumentSnapshot
 * @param Model
 * @param onDisposed
 * @returns
 */
function transform<T extends typeof Entity>(
    doc: DocumentSnapshot | DocumentReference,
    Model: T,
    onDisposed: (callback: () => void) => void
): InstanceType<T> {
    const cachedIdEntity = `${Model.collectionName}/${doc.id}`;
    if (cachedEntities[cachedIdEntity] === undefined) {
        const model = new Model();
        model.$setAndParseFromReference(doc);
        cachedEntities[cachedIdEntity] = {
            entity: model,
            usedBy: 0,
        };
    }

    cachedEntities[cachedIdEntity].usedBy++;

    onDisposed(() => {
        cachedEntities[cachedIdEntity].usedBy--;
        if (cachedEntities[cachedIdEntity].usedBy === 0) {
            cachedEntities[cachedIdEntity].entity.$getMetadata().destroy();
            delete cachedEntities[cachedIdEntity];
        }
    });

    return cachedEntities[cachedIdEntity].entity;
}
