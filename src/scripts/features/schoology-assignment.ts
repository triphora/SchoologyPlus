import { fetchApi } from "../utils/api";
import { conditionalClass, createElement, getTextNodeContent } from "../utils/dom";
import { Logger } from "../utils/logger";
import { SchoologyGradebookCategory } from "./schoology-gradebook-category";

export class SchoologyAssignment {
    public id: string;
    public name: string;
    public comment?: string;
    public exception?: string;
    public ignoreInCalculations: boolean;
    public isMissing: boolean = false;
    public failedToLoad: boolean = false;

    private _points?: number;
    private _maxPoints?: number;

    private _whatIfPoints?: number;
    private _whatIfMaxPoints?: number;

    constructor(public category: SchoologyGradebookCategory, public element: HTMLElement) {
        this.initElements();

        this.element.classList.add("splus-grades-assignment");

        this.id = this.element.dataset.id!.substring(2);
        this.name = getTextNodeContent(this._elem_title!);

        try {
            let scoreElement = this._elem_sgyPoints || this._elem_sgyRubricGradeValue;

            this._points = scoreElement ? Number.parseFloat(scoreElement!.textContent!) : undefined;

            if (Number.isNaN(this._points)) throw "NaN";
        } catch (err) {
            this._points = undefined;
            Logger.warn("Error parsing points for assignment", this, err);
        }

        try {
            this._maxPoints = this._elem_sgyMaxPoints
                ? Number.parseFloat(this._elem_sgyMaxPoints.textContent!.match(/\d+/)![0])
                : undefined;

            if (Number.isNaN(this._maxPoints)) throw "NaN";
        } catch (err) {
            this._maxPoints = undefined;
            Logger.warn("Error parsing max points for assignment", this, err);
        }

        this.comment = getTextNodeContent(this._elem_comment);
        this.exception = this._elem_exceptionText?.textContent ?? undefined;

        this.ignoreInCalculations =
            this.exception !== undefined ||
            (this._points === undefined && this._maxPoints === undefined);

        if (this._elem_exceptionIcon && this._elem_exceptionIcon.classList.contains("missing")) {
            this.ignoreInCalculations = false;
            this._points = 0;
            this._maxPoints = undefined;
            this.isMissing = true;
        }

        this.reconstructElements();

        this.loadPointsFromApi().then(() => this.render());
    }

    private _elem_title: HTMLAnchorElement | null = null;
    private _elem_sgyPoints: HTMLElement | null = null;
    private _elem_sgyMaxPoints: HTMLElement | null = null;
    private _elem_sgyRubricGradeValue: HTMLElement | null = null;
    private _elem_comment: HTMLElement | null = null;
    private _elem_exceptionText: HTMLElement | null = null;
    private _elem_exceptionIcon: HTMLElement | null = null;
    private _elem_sgyGradeContentWrapper: HTMLElement | null = null;
    private _elem_points: HTMLElement | null = null;
    private _elem_maxPoints: HTMLElement | null = null;
    private _elem_percent: HTMLElement | null = null;
    private _elem_editButton: HTMLElement | null = null;
    private _elem_sgyGradeWrapper: HTMLElement | null = null;

    private initElements() {
        this._elem_title = this.element.querySelector<HTMLAnchorElement>(
            ".title-column .title > a[href]"
        );

        this._elem_sgyGradeContentWrapper = this.element.querySelector(
            ".grade-column .td-content-wrapper"
        );

        this._elem_sgyPoints = this.element.querySelector(".rounded-grade");
        this._elem_sgyMaxPoints = this.element.querySelector(".max-grade");
        this._elem_sgyRubricGradeValue = this.element.querySelector(".rubric-grade-value");
        this._elem_comment = this.element.querySelector(".comment-column .comment");
        this._elem_exceptionText = this.element.querySelector(".exception .exception-text");
        this._elem_exceptionIcon = this.element.querySelector(".exception .exception-icon");
        this._elem_sgyGradeWrapper = this.element.querySelector(".grade-wrapper");
    }

    private reconstructElements() {
        this._elem_sgyGradeContentWrapper!.innerHTML = "";
        this._elem_points = createElement("span", ["rounded-grade"], { textContent: "—" });
        this._elem_maxPoints = createElement("span", ["max-grade"], { textContent: " / —" });
        this._elem_percent = createElement(
            "span",
            ["percentage-grade", "injected-assignment-percent"],
            { textContent: "N/A" }
        );

        // <img class="grade-edit-indicator" src="chrome-extension://fflijjibhgbhdgjgjkbbnamafdelcoal/imgs/edit-pencil.svg" width="12" data-parent-id="1045520-76111969" style="display: unset;">
        this._elem_editButton = createElement("img", ["splus-grades-edit-indicator"], {
            src: chrome.runtime.getURL("imgs/edit-pencil.svg"),
            width: 12,
            onclick: this.edit,
        });

        if (this._elem_exceptionIcon) {
            this._elem_sgyGradeContentWrapper!.append(this._elem_exceptionIcon);
        }

        this._elem_sgyGradeContentWrapper!.append(
            createElement("span", ["awarded-grade"], {}, [this._elem_points]),
            this._elem_maxPoints,
            this._elem_sgyGradeWrapper!,
            createElement("br"),
            this._elem_percent
        );

        this._elem_sgyGradeWrapper!.append(this._elem_editButton);
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, !!this.exception, "splus-grades-has-exception");
        conditionalClass(this.element, this.isModified, "splus-grades-modified");

        if (!this.isLoading) {
            this._elem_points!.textContent = this.getPoints(whatIf)?.toString() ?? "—";
            this._elem_maxPoints!.textContent = ` / ${
                this.getMaxPoints(whatIf)?.toString() ?? "—"
            }`;
            this._elem_percent!.textContent = this.getGradePercentageString(whatIf);
            this._elem_percent!.title = this.getGradePercentageDetailsString(whatIf);
        }

        this.category.render(whatIf);
    }

    public async edit() {
        // TODO
    }

    public getPoints(whatIf: boolean = false) {
        if (whatIf) return this._whatIfPoints ?? this._points;
        return this._points;
    }

    public getMaxPoints(whatIf: boolean = false) {
        if (whatIf) return this._whatIfMaxPoints ?? this._maxPoints;
        return this._maxPoints;
    }

    public get course() {
        return this.category.course;
    }

    public get isLoading() {
        return (
            (this._points === undefined || this._maxPoints === undefined) &&
            !this.ignoreInCalculations &&
            !this.failedToLoad
        );
    }

    public get isModified() {
        return this._whatIfPoints !== undefined || this._whatIfMaxPoints !== undefined;
    }

    private async loadPointsFromApi() {
        Logger.debug(`Fetching max points for (nonentered) assignment ${this.id}`);

        let needToLoadPoints = () => {
            return this._points === undefined && !this.ignoreInCalculations && !this.exception;
        };

        let shouldLoadMaxPoints = () => {
            return this._maxPoints === undefined;
        };

        let needToLoadMaxPoints = () => {
            return this._maxPoints === undefined && !this.ignoreInCalculations;
        };

        if (!needToLoadPoints() && !shouldLoadMaxPoints()) return;

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
                    this._points = Number.parseFloat(jsonAssignment.grade);
                }

                if (
                    shouldLoadMaxPoints() &&
                    jsonAssignment.max_points !== undefined &&
                    jsonAssignment.max_points !== null
                ) {
                    this._maxPoints = Number.parseFloat(jsonAssignment.max_points);
                }
            }

            if (needToLoadPoints() || shouldLoadMaxPoints()) {
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
                        this._maxPoints = Number.parseFloat(json.max_points);
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

        if (shouldLoadMaxPoints() && !needToLoadMaxPoints()) {
            Logger.warn(
                `Failed to load max points for assignment ${this.id} from API, but the assignment is not consequential for calculations`
            );
            return;
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
                if (this._points !== undefined && this._maxPoints !== undefined) {
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

    public getGradePercent(whatIf: boolean = false) {
        let points = this.getPoints(whatIf);
        let maxPoints = this.getMaxPoints(whatIf);

        if (this.ignoreInCalculations) return undefined;
        if (maxPoints === 0) return Number.POSITIVE_INFINITY;
        if (points === 0) return 0;

        return points !== undefined && maxPoints !== undefined
            ? (points * 100) / maxPoints
            : undefined;
    }

    public getGradePercentageString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (this.isLoading) return "LOADING";
        if (this.failedToLoad) return "ERR";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(gradePercent)}%`;
    }

    public getGradePercentageDetailsString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (this.isLoading) return "Loading grade percentage...";
        if (this.failedToLoad) return "Failed to load grade percentage";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY)
            return `${this.getPoints(whatIf)} points of Extra Credit`;
        return `${gradePercent}%`;
    }

    public toString(whatIf: boolean = false) {
        return `${this.name} (${this.id}) - ${this.getPoints(whatIf)}/${this.getMaxPoints(
            whatIf
        )} - ${this.getGradePercentageString(whatIf)} - ${this.comment} - ${this.exception}`;
    }
}
