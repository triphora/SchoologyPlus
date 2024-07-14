import { fetchApi } from "../utils/api";
import { getTextNodeContent } from "../utils/dom";
import { Logger } from "../utils/logger";
import { SchoologyGradebookCategory } from "./schoology-gradebook-category";

export class SchoologyAssignment {
    public id: string;
    public name: string;
    public points?: number;
    public maxPoints?: number;
    public comment?: string;
    public exception?: string;
    public ignoreInCalculations: boolean;
    public isMissing: boolean = false;
    public failedToLoad: boolean = false;

    constructor(public category: SchoologyGradebookCategory, public element: HTMLElement) {
        this.id = this.element.dataset.id!.substring(2);
        this.name = getTextNodeContent(
            element.querySelector<HTMLAnchorElement>(".title-column .title > a[href]")!
        );

        try {
            let scoreElement =
                this.element.querySelector(".rounded-grade") ||
                this.element.querySelector(".rubric-grade-value");

            this.points = scoreElement ? Number.parseFloat(scoreElement!.textContent!) : undefined;

            if (Number.isNaN(this.points)) throw "NaN";
        } catch (err) {
            this.points = undefined;
            Logger.warn("Error parsing points for assignment", this, err);
        }

        try {
            let maxPointsElement = this.element.querySelector(".max-grade");

            this.maxPoints = maxPointsElement
                ? Number.parseFloat(maxPointsElement.textContent!.match(/\d+/)![0])
                : undefined;

            if (Number.isNaN(this.maxPoints)) throw "NaN";
        } catch (err) {
            this.maxPoints = undefined;
            Logger.warn("Error parsing max points for assignment", this, err);
        }

        this.comment = getTextNodeContent(element.querySelector(".comment-column .comment")!);
        this.exception =
            element.querySelector(".exception .exception-text")?.textContent ?? undefined;

        this.ignoreInCalculations =
            this.exception !== undefined ||
            (this.points === undefined && this.maxPoints === undefined);

        if (this.element.querySelector(".exception-icon.missing")) {
            this.ignoreInCalculations = false;
            this.points = 0;
            this.maxPoints = undefined;
            this.isMissing = true;
        }

        this.loadPointsFromApi().then(() => this.render());
    }

    public async render() {
        this.category.render();
    }

    public get course() {
        return this.category.course;
    }

    public get isLoading() {
        return (
            (this.points === undefined || this.maxPoints === undefined) &&
            !this.ignoreInCalculations &&
            !this.failedToLoad
        );
    }

    private async loadPointsFromApi() {
        Logger.debug(`Fetching max points for (nonentered) assignment ${this.id}`);

        let needToLoadPoints = () => {
            return this.points === undefined && !this.ignoreInCalculations && !this.exception;
        };

        let needToLoadMaxPoints = () => {
            return this.maxPoints === undefined && !this.ignoreInCalculations;
        };

        if (!needToLoadPoints() && !needToLoadMaxPoints()) return;

        let response: Response | null = null;
        let firstTryError: any = null;
        let listSearchError: any = null;

        try {
            let listSearch = this.course.apiCourseAssignments;
            if (listSearch && listSearch.section.length > 0) {
                // success case
                let jsonAssignment = listSearch.section[0].period
                    .flatMap((p: any) => p.assignment)
                    .filter((x: any) => x.assignment_id == Number.parseInt(this.id!))[0];

                if (
                    needToLoadPoints() &&
                    jsonAssignment.grade !== undefined &&
                    jsonAssignment.grade !== null
                ) {
                    this.points = Number.parseFloat(jsonAssignment.grade);
                }

                if (
                    needToLoadMaxPoints() &&
                    jsonAssignment.max_points !== undefined &&
                    jsonAssignment.max_points !== null
                ) {
                    this.maxPoints = Number.parseFloat(jsonAssignment.max_points);
                }
            }

            if (needToLoadPoints() || needToLoadMaxPoints()) {
                throw `Failed to load points from list search for assignment ${this.id}`;
            }

            Logger.debug(`Successfully loaded points for assignment ${this.id} from list search`);

            return;
        } catch (err) {
            listSearchError = err;
        }

        if (!needToLoadPoints()) {
            try {
                response = await fetchApi(`sections/${this.course.id}/assignments/${this.id}`);

                if (response && !response.ok) {
                    firstTryError = { status: response.status, error: response.statusText };
                } else if (response) {
                    let json = await response.json();

                    if (json && json.max_points !== undefined && json.max_points !== null) {
                        this.maxPoints = Number.parseFloat(json.max_points);
                        Logger.debug(
                            `Successfully loaded max points for assignment ${this.id} from API`
                        );
                        return;
                    } else {
                        firstTryError = "JSON returned without max points";
                    }
                } else if (!firstTryError) {
                    firstTryError = "Unknown error fetching API response";
                }
            } catch (err) {
                firstTryError = err;
            }
        }

        this.failedToLoad = true;
        Logger.error(
            `Failed to load points for assignment "${this.name}" (${this.id}) from category "${this.category.name}" from period "${this.category.period.name}" from course "${this.category.period.course.name}" (${this.category.period.course.id})`,
            { firstTryError, listSearchError }
        );
    }

    public async waitForPoints(timeout: number = 30000) {
        return new Promise<void>((resolve, reject) => {
            let startTime = Date.now();
            let interval = setInterval(() => {
                if (this.points !== undefined && this.maxPoints !== undefined) {
                    clearInterval(interval);
                    resolve();
                }

                if (this.failedToLoad || Date.now() - startTime >= timeout) {
                    clearInterval(interval);
                    reject(
                        new Error(
                            `Timeout (${timeout} ms) waiting for points on assignment "${this.name}" (${this.id}) from category "${this.category.name}" from period "${this.category.period.name}" from course "${this.category.period.course.name}" (${this.category.period.course.id})`
                        )
                    );
                }
            }, 500);
        });
    }

    public get gradePercent() {
        if (this.ignoreInCalculations) return undefined;
        if (this.maxPoints === 0) return Number.POSITIVE_INFINITY;
        if (this.points === 0) return 0;

        return this.points !== undefined && this.maxPoints !== undefined
            ? (this.points * 100) / this.maxPoints
            : undefined;
    }

    public get gradePercentageString() {
        if (this.isLoading) return "LOADING";
        if (this.failedToLoad) return "ERR";
        if (this.gradePercent === undefined) return "—";
        if (this.gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(this.gradePercent)}%`;
    }

    public get gradePercentageDetailsString() {
        if (this.isLoading) return "Loading grade percentage...";
        if (this.failedToLoad) return "Failed to load grade percentage";
        if (this.gradePercent === undefined) return "—";
        if (this.gradePercent === Number.POSITIVE_INFINITY)
            return `${this.points} points of Extra Credit`;
        return `${this.gradePercent}%`;
    }

    public toString() {
        return `${this.name} (${this.id}) - ${this.points}/${this.maxPoints} - ${this.gradePercentageString} - ${this.comment} - ${this.exception}`;
    }
}
