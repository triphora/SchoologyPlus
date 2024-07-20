import { fetchApi, getUserId } from "../utils/api";
import { EXTENSION_NAME } from "../utils/constants";
import { conditionalClass, createElement, getTextNodeContent } from "../utils/dom";
import { Logger } from "../utils/logger";
import { getGradingScale } from "../utils/settings";
import { Settings } from "../utils/splus-settings";
import { SchoologyGradebookPeriod } from "./schoology-gradebook-period";
import { getLetterGrade } from "./what-if-grades";

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
    }

    private _elem_title: HTMLAnchorElement | null = null;
    private _elem_summary: HTMLElement | null = null;
    private _elem_courseGrade: HTMLElement | null = null;
    private _elem_gradeText: HTMLElement | null = null;

    private initElements() {
        this._elem_title =
            this.element.querySelector<HTMLAnchorElement>(".gradebook-course-title")!;
        this._elem_summary = this.element.querySelector(".summary-course")!;
        let awardedGrade = this.element.querySelector<HTMLElement>(".awarded-grade");
        if (awardedGrade) {
            this._elem_courseGrade = awardedGrade;
        } else {
            this._elem_courseGrade = createElement("span", [], {
                textContent: `${this.apiCourseAssignments.section[0].final_grade
                    .at(-1)
                    .grade.toString()}%`,
            });
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
    }

    public async render(whatIf: boolean = false) {
        conditionalClass(this.element, this.isLoading, "splus-grades-loading");
        conditionalClass(this.element, this.failedToLoad, "splus-grades-failed");
        conditionalClass(this.element, this.isLoading || this.failedToLoad, "splus-grades-issue");
        conditionalClass(this.element, this.isModified, "splus-grades-modified");

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
        let letterGrade = this.getLetterGrade(this.getGradePercent(whatIf)!);

        if (letterGrade === null) {
            elem.textContent = this.getGradePercentageString(whatIf);
            elem.title = this.getGradePercentageDetailsString(whatIf);
            return;
        }

        elem.textContent = this.getLetterGradeString(whatIf);
        elem.title = `${this.getGradePercentageDetailsString(
            whatIf
        )}\nLetter grade calculated by ${EXTENSION_NAME} using the following grading scale:\n${
            this.gradingScaleString
        }\nTo change this grading scale, find 'Course Options' on the page for this course`;
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
        let weightedPoints = this.periods.reduce((acc, period) => {
            if (period.weight === undefined) return acc;
            return acc + period.getPoints(whatIf) * period.weight;
        }, 0);

        let weightedMaxPoints = this.periods.reduce((acc, period) => {
            if (period.weight === undefined) return acc;
            return acc + period.getMaxPoints(whatIf) * period.weight;
        }, 0);

        if (weightedPoints === 0 && weightedMaxPoints === 0) return undefined;
        if (weightedMaxPoints === 0) return Number.POSITIVE_INFINITY;
        if (weightedPoints === 0) return 0;

        return (weightedPoints * 100) / weightedMaxPoints;
    }

    public getGradePercentageString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (this.isLoading) return "LOADING";
        if (this.failedToLoad) return "ERR";
        if (gradePercent === undefined) return "—";
        if (gradePercent === Number.POSITIVE_INFINITY) return "EC";
        return `${Math.round(gradePercent * 100) / 100}%`;
    }

    public getGradePercentageDetailsString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (this.isLoading) return "Loading grade percentage...";
        if (this.failedToLoad) return "Failed to load grade percentage";
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

    public get apiCourseAssignments() {
        return this._cachedListSearch;
    }

    public get gradingScale() {
        return getGradingScale(this.id);
    }

    public getLetterGradeString(whatIf: boolean = false) {
        let gradePercent = this.getGradePercent(whatIf);

        if (gradePercent === undefined) return "—";
        let letterGrade = this.getLetterGrade(gradePercent);
        return `${letterGrade} (${this.getGradePercentageString(whatIf)})`;
    }

    public get gradingScaleString() {
        return Object.keys(this.gradingScale)
            .sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
            .reverse()
            .map(x => `${this.gradingScale[x]}: ${x}%`)
            .join("\n");
    }

    public getLetterGrade(percentage: number): string | null {
        if (Settings.CustomGradingScales.value == "disabled") return null;
        return getLetterGrade(this.gradingScale, percentage);
    }
}
