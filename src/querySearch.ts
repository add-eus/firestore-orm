import type {
    CollectionReference,
    DocumentSnapshot,
    QueryConstraint,
} from "firebase/firestore";
import { documentId, where } from "firebase/firestore";
import { Query } from "./query";

export class QuerySearch extends Query {
    private searchText = "";
    private algoliaIndex;
    private hits: any[] | null = null;
    private currentHitIndex = 0;

    constructor(
        constraints: QueryConstraint[],
        list: any[],
        transform: Function,
        reference: CollectionReference,
        searchText: string,
        algoliaIndex: any
    ) {
        super(constraints, list, transform, reference);
        this.constraints = constraints;
        this.searchText = searchText;
        this.algoliaIndex = algoliaIndex;
    }

    async next(
        limit: number,
        additionalConstraints: QueryConstraint[] = []
    ): Promise<DocumentSnapshot[]> {
        if (!this.hits) {
            const facetFilters = this.constraints
                .filter((constraint: any) => {
                    return (
                        constraint.type === "where" && constraint._op === "array-contains"
                    );
                })
                .map((constraint: any) => {
                    const key = constraint._field.segments.join(".");
                    return `${key}:${constraint._value}`;
                });
            // https://www.algolia.com/doc/api-reference/api-parameters/filters/
            const { hits } = await this.algoliaIndex.search(this.searchText, {
                facetFilters,
            });
            this.hits = hits;
        }
        if (!this.hits || this.hits.length === 0) return [];

        let i;
        let docs: DocumentSnapshot[] = [];
        const scale = limit > 10 ? 10 : limit;
        for (i = this.currentHitIndex; i < this.hits.length; i += scale) {
            const hitObjectIDS = this.hits
                .slice(this.currentHitIndex, scale + this.currentHitIndex)
                .map((hit) => hit.objectID);

            const parentDocs = await super.next(i - this.currentHitIndex, [
                where(documentId(), "in", hitObjectIDS),
                ...additionalConstraints,
            ]);

            docs = docs.concat(parentDocs);

            this.currentHitIndex = i;
            if (docs.length > limit) break;
        }

        return docs;
    }
}
