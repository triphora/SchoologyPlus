import { fetchApi } from "../utils/api";
import { conditionalClass, createElement, getTextNodeContent } from "../utils/dom";
import { Logger } from "../utils/logger";
import { SchoologyGradebookCategory } from "./schoology-gradebook-category";
import { whatIfGradesEnabled } from "./what-if-grades";

export class SchoologyAssignment {
    public id: string;
    public name: string;
    public comment?: string;
    public exception?: string;
    public isMissing: boolean = false;
    public failedToLoad: boolean = false;
    public sgyGradeFactor: number = 1;

    private _isDropped: boolean;
    private _points?: number;
    private _maxPoints?: number;

    private _whatIfPoints?: number;
    private _whatIfMaxPoints?: number;
    private _whatIfDropped?: boolean;

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
        this._isDropped = this.element.classList.contains("dropped");

        if (this._elem_exceptionIcon && this._elem_exceptionIcon.classList.contains("missing")) {
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
    private _elem_whatIfTextBox: HTMLElement | null = null;
    private _elem_scoreWrapper: HTMLElement | null = null;
    private _elem_gradeFactor: HTMLElement | null = null;

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
        this._elem_points = createElement("span", ["rounded-grade", "splus-grades-grade-value"], {
            textContent: "—",
        });
        this._elem_maxPoints = createElement("span", ["max-grade", "splus-grades-grade-value"], {
            textContent: "—",
        });
        this._elem_gradeFactor = createElement("span", ["splus-grades-grade-factor"], {
            textContent: "x1",
        });
        this._elem_whatIfTextBox = createElement("span", ["splus-grades-what-if-edit"], {
            textContent: "—",
            onblur: this.whatIfGradeChanged.bind(this),
            onkeydown: event => {
                if (event.which === 13) {
                    (event.target as HTMLElement).blur();
                    window.getSelection()?.removeAllRanges();
                }
            },
            contentEditable: "true",
        });
        this._elem_percent = createElement(
            "span",
            ["percentage-grade", "injected-assignment-percent"],
            { textContent: "N/A" }
        );

        // <img class="grade-edit-indicator" src="chrome-extension://fflijjibhgbhdgjgjkbbnamafdelcoal/imgs/edit-pencil.svg" width="12" data-parent-id="1045520-76111969" style="display: unset;">
        this._elem_editButton = createElement("img", ["splus-grades-edit-indicator"], {
            src: chrome.runtime.getURL("imgs/edit-pencil.svg"),
            width: 12,
            onclick: this.edit.bind(this),
        });

        this._elem_scoreWrapper = createElement("span", ["splus-grades-score-wrapper"], {}, [
            createElement("span", ["awarded-grade"], {}, [this._elem_points]),
            createElement("span", ["grade-divider", "splus-grades-grade-value", "max-grade"], {
                textContent: " / ",
            }),
            this._elem_maxPoints,
            this._elem_whatIfTextBox,
        ]);

        if (this._elem_exceptionIcon) {
            this._elem_scoreWrapper!.prepend(this._elem_exceptionIcon);
        }

        this._elem_sgyGradeContentWrapper!.append(
            this._elem_scoreWrapper,
            this._elem_sgyGradeWrapper!,
            createElement("br"),
            this._elem_percent,
            this._elem_gradeFactor
        );

        this._elem_sgyGradeWrapper!.append(this._elem_editButton);
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, !!this.exception, "splus-grades-has-exception");
        conditionalClass(
            this.element,
            !!this._elem_exceptionIcon,
            "splus-grades-has-exception-icon"
        );
        conditionalClass(this.element, this.isModified, "splus-grades-modified");
        conditionalClass(this.element, this.getIsDropped(whatIf), "dropped");
        conditionalClass(
            this.element,
            this.getIgnoreInCalculations(whatIf),
            "splus-grades-ignored"
        );

        let apiAssignment = this.course.getApiAssignment(this.id);
        if (apiAssignment) {
            // todo: also handle "exclude from grade" and categories that treat assignments equally
            this.sgyGradeFactor = Number.parseFloat(apiAssignment.factor);
        }
        conditionalClass(
            this.element,
            this.sgyGradeFactor !== 1,
            "splus-grades-grade-factor-enabled"
        );
        this._elem_gradeFactor!.textContent = `x${this.sgyGradeFactor}`;
        this._elem_gradeFactor!.title = `Your instructor made this assignment worth ${this.sgyGradeFactor}x its normal value`;

        if (!this.isLoading) {
            this._elem_points!.textContent = this.getPoints(whatIf)?.toString() ?? "—";
            this._elem_maxPoints!.textContent = this.getMaxPoints(whatIf)?.toString() ?? "—";
            this._elem_whatIfTextBox!.textContent = `${
                this.getPoints(whatIf) ?? 0
            } / ${this.getMaxPoints(whatIf)}`;
            this._elem_percent!.textContent = this.getGradePercentageString(whatIf);
            this._elem_percent!.title = this.getGradePercentageDetailsString(whatIf);
        }

        this.category.render(whatIf);
    }

    public async edit() {
        this.element.classList.add("splus-whatif-editing");
        this._elem_whatIfTextBox!.focus();
        document.execCommand("selectAll", false, null as any);
    }

    private whatIfGradeChanged() {
        this.element.classList.remove("splus-whatif-editing");

        let text = this._elem_whatIfTextBox!.textContent;
        let [points, maxPoints] = text!.split("/").map(x => Number.parseFloat(x));

        if (Number.isNaN(points) || Number.isNaN(maxPoints)) {
            this._whatIfPoints = undefined;
            this._whatIfMaxPoints = undefined;
        } else {
            this._whatIfPoints = points;
            this._whatIfMaxPoints = maxPoints;
        }

        this.render(whatIfGradesEnabled());
    }

    public getPoints(whatIf: boolean = false) {
        if (whatIf) return this._whatIfPoints ?? this._points;
        return this._points;
    }

    public getMaxPoints(whatIf: boolean = false) {
        if (whatIf) return this._whatIfMaxPoints ?? this._maxPoints;
        return this._maxPoints;
    }

    public getIsDropped(whatIf: boolean = false) {
        if (whatIf) return this._whatIfDropped ?? this._isDropped;
        return this._isDropped;
    }

    public getIgnoreInCalculations(whatIf: boolean = false) {
        let isDropped = this.getIsDropped(whatIf);
        let hasNonMissingException =
            !this.isModified && this.exception !== undefined && !this.isMissing;
        let pointsAreUndefined = this.getPoints(whatIf) === undefined; // && this.getMaxPoints(whatIf) === undefined;

        // ignore if:
        // - dropped
        // - exception (except for missing) unless a what-if grade is entered
        // - points ~~and max points~~ are undefined

        return isDropped || hasNonMissingException || pointsAreUndefined;
    }

    public get course() {
        return this.category.course;
    }

    public get isLoading() {
        return (
            (this._points === undefined || this._maxPoints === undefined) &&
            !this.getIgnoreInCalculations() &&
            !this.failedToLoad
        );
    }

    public get isModified() {
        return this._whatIfPoints !== undefined || this._whatIfMaxPoints !== undefined;
    }

    private async loadPointsFromApi() {
        Logger.debug(`Fetching max points for (nonentered) assignment ${this.id}`);

        let shouldLoadPoints = () => {
            return this._points === undefined;
        };

        let needToLoadPoints = () => {
            return this._points === undefined && !this.getIgnoreInCalculations() && !this.exception;
        };

        let shouldLoadMaxPoints = () => {
            return this._maxPoints === undefined;
        };

        let needToLoadMaxPoints = () => {
            return this._maxPoints === undefined && !this.getIgnoreInCalculations();
        };

        if (!shouldLoadPoints() && !shouldLoadMaxPoints()) return;

        let response: Response | null = null;
        let firstTryError: any = null;
        let listSearchError: any = null;

        try {
            let listSearch = this.course.apiCourseGrades;
            if (listSearch && listSearch.section.length > 0) {
                // success case
                let jsonAssignment = listSearch.section[0].period
                    .flatMap((p: any) => p.assignment)
                    .filter((x: any) => x.assignment_id == Number.parseInt(this.id!))[0];

                if (
                    shouldLoadPoints() &&
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

            if (shouldLoadPoints() || shouldLoadMaxPoints()) {
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

        if (shouldLoadPoints() && !needToLoadPoints()) {
            Logger.warn(
                `Failed to load points for assignment ${this.id} from API, but the assignment is not consequential for calculations`
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

        if (this.getIgnoreInCalculations(whatIf)) return undefined;
        if (maxPoints === 0) return Number.POSITIVE_INFINITY;
        if (points === 0) return 0;

        return points !== undefined && maxPoints !== undefined
            ? (points * 100) / maxPoints
            : undefined;
    }

    public getGradePercentageString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (!this.isModified && this.isLoading) return "LOADING";
        if (!this.isModified && this.failedToLoad) return "ERR";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(gradePercent)}%`;
    }

    public getGradePercentageDetailsString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (!this.isModified && this.isLoading) return "Loading grade percentage...";
        if (!this.isModified && this.failedToLoad) return "Failed to load grade percentage";
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
