import { fetchApi, getUserId } from "../utils/api";
import { EXTENSION_NAME } from "../utils/constants";
import { conditionalClass, createElement, getTextNodeContent } from "../utils/dom";
import { Logger } from "../utils/logger";
import { getGradingScale } from "../utils/settings";
import { Settings } from "../utils/splus-settings";
import { SchoologyGradebookPeriod } from "./schoology-gradebook-period";
import { getLetterGrade, whatIfGradesEnabled } from "./what-if-grades";

/*
    Basic idea of what to do:
     - we always maintain the source of truth state in these models
     - when the user makes a change, we updated "what-if" state of model and re-render the UI
*/

export class SchoologyCourse {
    public periods: SchoologyGradebookPeriod[] = [];
    public id: string;
    public name: string;
    public gradebookTable: HTMLTableElement;

    private _cachedListSearch: any = undefined;
    private _cachedAssignmentList: any = undefined;

    constructor(public element: HTMLElement) {
        this.element.classList.add("splus-grades-course");

        this.id = this.element.id.match(/\d+/)![0];
        this.name = getTextNodeContent(
            this.element.querySelector(".gradebook-course-title > a[href]")!
        );
        this.gradebookTable = this.element.querySelector<HTMLTableElement>(
            ".gradebook-course-grades > table"
        )!;
    }

    public async load() {
        let periodElements =
            this.gradebookTable.querySelectorAll<HTMLTableRowElement>("tr.period-row");

        await this.cacheListSearch();

        this.initElements();

        for (let periodElement of periodElements) {
            let period = new SchoologyGradebookPeriod(this, periodElement);
            this.periods.push(period);
            period.load();
        }

        this.render();

        await this.cacheAssignmentList();
        this.renderAllAssignments(whatIfGradesEnabled());
    }

    private _elem_title: HTMLAnchorElement | null = null;
    private _elem_summary: HTMLElement | null = null;
    private _elem_courseGrade: HTMLElement | null = null;
    private _elem_gradeText: HTMLElement | null = null;
    private _elem_gradeModifiedIndicator: HTMLElement | null = null;

    private initElements() {
        this._elem_title =
            this.element.querySelector<HTMLAnchorElement>(".gradebook-course-title")!;
        this._elem_summary = this.element.querySelector(".summary-course")!;
        let awardedGrade = this.element.querySelector<HTMLElement>(".awarded-grade");
        if (awardedGrade) {
            this._elem_courseGrade = awardedGrade;
        } else {
            try {
                this._elem_courseGrade = createElement("span", [], {
                    textContent: `${this.apiCourseGrades.section[0].final_grade
                        .at(-1)
                        .grade.toString()}%`,
                });
            } catch (ex) {
                Logger.warn(
                    `Could not find final_grade for course ${this.id} (${this.name})`,
                    this
                );
            }
        }
        this._elem_gradeText = createElement(
            "span",
            [
                "awarded-grade",
                "injected-title-grade",
                this._elem_courseGrade ? "grade-active-color" : "grade-none-color",
            ],
            { textContent: "LOADING" }
        );
        this._elem_title.appendChild(this._elem_gradeText);

        this._elem_gradeModifiedIndicator = createElement(
            "span",
            ["splus-grades-course-modified-indicator"],
            {
                textContent: "!",
                title: "This grade has been modified from its true value with Schoology Plus",
            }
        );

        this._elem_gradeText.before(this._elem_gradeModifiedIndicator);
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, this.isModified, "splus-grades-course-modified");

        if (!this.isLoading) {
            this.addLetterGrade(this._elem_gradeText!, whatIf);
        }
    }

    public async renderAllAssignments(whatIf: boolean = false) {
        for (let assignment of this.assignments) {
            await assignment.render(whatIf);
        }
    }

    private addLetterGrade(elem: HTMLElement, whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);
        let letterGrade = gradePercent !== undefined ? this.getLetterGrade(gradePercent) : null;

        if (letterGrade === null) {
            elem.textContent = this.getGradePercentageString(whatIf);
            elem.title = this.getGradePercentageDetailsString(whatIf);
            return;
        }

        elem.textContent = this.getLetterGradeString(whatIf);
        elem.title = `${this.getGradePercentageDetailsString(whatIf)}\n${
            this.gradingScaleCalculationNotice
        }`;
    }

    public get categories() {
        return this.periods.flatMap(p => p.categories);
    }

    public get assignments() {
        return this.categories.flatMap(c => c.assignments);
    }

    public get isLoading() {
        return this.periods.some(period => period.isLoading);
    }

    public get failedToLoad() {
        return this.periods.some(period => period.failedToLoad);
    }

    public get isModified() {
        return this.periods.some(period => period.isModified);
    }

    public getGradePercent(whatIf: boolean = false) {
        let gradePercent = 0;
        let anyValidGrades = false;

        for (let period of this.periods) {
            if (period.weight !== 0) {
                let periodGradePercent = period.getGradePercent(whatIf);
                if (periodGradePercent === undefined) continue;
                gradePercent += periodGradePercent * period.weight;
                anyValidGrades = true;
            }
        }

        if (!anyValidGrades) return undefined;

        return gradePercent;
    }

    public getGradePercentageString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (!this.isModified && this.isLoading) return "LOADING";
        if (!this.isModified && this.failedToLoad) return "ERR";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(gradePercent * 100) / 100}%`;
    }

    public getGradePercentageDetailsString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (!this.isModified && this.isLoading) return "Loading grade percentage...";
        if (!this.isModified && this.failedToLoad) return "Failed to load grade percentage";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "Extra Credit";
        return `${gradePercent}%`;
    }

    public toString(whatIf: boolean = false) {
        return `${this.name} (${this.id}) - ${this.getGradePercentageString(whatIf)}`;
    }

    public toDetailedString() {
        let courseString = [];
        courseString.push(this.toString());
        for (let period of this.periods) {
            courseString.push(`  ${period.toString()}`);
            for (let category of period.categories) {
                courseString.push(`    ${category.toString()}`);
                for (let assignment of category.assignments) {
                    courseString.push(`      ${assignment.toString()}`);
                }
            }
        }

        return courseString.join("\n");
    }

    private async cacheListSearch() {
        try {
            if (this._cachedListSearch === undefined) {
                let response = await fetchApi(`users/${getUserId()}/grades?section_id=${this.id}`);
                if (!response.ok) {
                    throw { status: response.status, error: response.statusText };
                }
                this._cachedListSearch = await response.json();
                Logger.debug(`Successfully cached list search for course ${this.id}`);
            }
        } catch (err) {
            Logger.error("Failed to cache list search", err);
            this._cachedListSearch = null;
        }
    }

    private async cacheAssignmentList() {
        try {
            let hasNext = true;
            let allAssignments = [];
            let page = 0;
            while (hasNext) {
                let response = await fetchApi(
                    `sections/${this.id}/assignments?start=${page * 50}&limit=50`
                );

                if (!response.ok) {
                    throw { status: response.status, error: response.statusText };
                }

                let data = await response.json();
                allAssignments.push(...data.assignment);
                hasNext = !!data.links.next;
                page++;
            }

            this._cachedAssignmentList = allAssignments;
        } catch (err) {
            Logger.error("Failed to cache assignment list", err);
            return null;
        }
    }

    public get apiCourseGrades() {
        return this._cachedListSearch;
    }

    public get apiCourseAssignments(): any[] | undefined | null {
        return this._cachedAssignmentList;
    }

    public getApiAssignment(assignmentId: string) {
        return this.apiCourseAssignments?.find((a: any) => a.id === Number.parseInt(assignmentId));
    }

    public get gradingScale() {
        if (Settings.CustomGradingScales.value === "disabled") return null;
        return getGradingScale(this.id);
    }

    public getLetterGradeString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (gradePercent === undefined) return "—";
        let letterGrade = this.getLetterGrade(gradePercent);
        return `${letterGrade} (${this.getGradePercentageString(whatIf)})`;
    }

    public get gradingScaleString() {
        if (this.gradingScale === null) return "";

        return Object.keys(this.gradingScale)
            .sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
            .reverse()
            .map(x => `${this.gradingScale![x]}: ${x}%`)
            .join("\n");
    }

    public get gradingScaleCalculationNotice() {
        if (this.gradingScale === null) return "";
        return `Letter grade calculated by ${EXTENSION_NAME} using the following grading scale:\n${this.gradingScaleString}\nTo change this grading scale, find 'Course Options' on the page for this course`;
    }

    public getLetterGrade(percentage: number): string | null {
        if (this.gradingScale === null) return null;
        return getLetterGrade(this.gradingScale, percentage);
    }
}
