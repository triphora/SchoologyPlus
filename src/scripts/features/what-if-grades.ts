import { EXTENSION_WEBSITE } from "../utils/constants";
import { conditionalClass, createElement } from "../utils/dom";
import { Logger } from "../utils/logger";
import { SchoologyCourse } from "./schoology-course";

const WHAT_IF_GRADES_TOGGLE_CHECKBOX = createElement("input", ["splus-track-clicks"], {
    type: "checkbox",
    id: "enable-modify",
    dataset: {
        splusTrackingContext: "What-If Grades",
    },
    onclick: toggleWhatIfGrades,
});

export function whatIfGradesEnabled() {
    return WHAT_IF_GRADES_TOGGLE_CHECKBOX.checked;
}

export function enableWhatIfGrades() {
    WHAT_IF_GRADES_TOGGLE_CHECKBOX.checked = true;
    toggleWhatIfGrades();
}

export function disableWhatIfGrades() {
    WHAT_IF_GRADES_TOGGLE_CHECKBOX.checked = false;
    toggleWhatIfGrades();
}

export var gradebookCourses: SchoologyCourse[] = [];

export function loadWhatIfGrades() {
    document.documentElement.classList.add("splus-what-if-grades-v2");

    addCheckbox();

    gradebookCourses = loadCourses();
    Logger.log("Loaded courses:", gradebookCourses);

    for (let course of gradebookCourses) {
        Logger.log(course.toDetailedString());
    }

    return gradebookCourses;
}

function addCheckbox() {
    if (
        // !document.location.search.includes("past") ||
        // document.location.search.split("past=")[1] != "1"
        true
    ) {
        let timeRow = document.getElementById("past-selector");
        let gradeModifLabelFirst = true;
        if (timeRow == null) {
            // basically a verbose null propagation
            // timeRow = document.querySelector(".content-top-upper")?.insertAdjacentElement('afterend', document.createElement("div"))
            let contentTopUpper = document.querySelector(".content-top-upper");
            if (contentTopUpper) {
                timeRow = contentTopUpper.insertAdjacentElement(
                    "afterend",
                    document.createElement("div")
                ) as HTMLDivElement;
            }
        }
        if (timeRow == null) {
            let downloadBtn = document.querySelector("#main-inner .download-grade-wrapper");
            if (downloadBtn) {
                let checkboxHolder = document.createElement("span");
                checkboxHolder.id = "splus-gradeedit-checkbox-holder";
                downloadBtn.prepend(checkboxHolder);

                downloadBtn.classList.add("splus-gradeedit-checkbox-holder-wrapper");

                timeRow = checkboxHolder;
                gradeModifLabelFirst = false;
            }
        }

        let timeRowLabel = createElement(
            "label",
            ["modify-label"],
            {
                htmlFor: "enable-modify",
            },
            [
                createElement("span", [], { textContent: "Enable what-if grades" }),
                createElement(
                    "a",
                    ["splus-grade-help-btn"],
                    {
                        href: `${EXTENSION_WEBSITE}/docs/grades`,
                        target: "_blank",
                    },
                    [createElement("span", ["icon-help"])]
                ),
            ]
        );

        let wrapper = createElement("div", ["splus-grades-what-if-wrapper"]);

        if (gradeModifLabelFirst) {
            wrapper?.appendChild(timeRowLabel);
        }

        wrapper?.appendChild(WHAT_IF_GRADES_TOGGLE_CHECKBOX);

        if (!gradeModifLabelFirst) {
            wrapper?.appendChild(timeRowLabel);
        }

        timeRow?.appendChild(wrapper);
    }
}

function toggleWhatIfGrades() {
    conditionalClass(
        document.documentElement,
        whatIfGradesEnabled(),
        "splus-what-if-grades-v2-enabled"
    );

    for (let course of gradebookCourses) {
        course.renderAllAssignments(whatIfGradesEnabled());
    }
}

function loadCourses() {
    let courseElements = document.querySelectorAll<HTMLDivElement>("div.gradebook-course");

    let courses: SchoologyCourse[] = [];

    for (let courseElement of courseElements) {
        let course = new SchoologyCourse(courseElement);
        courses.push(course);
        course.load();
    }

    return courses;
}

export function getLetterGrade(gradingScale: Record<string, string>, percentage?: number): string {
    if (percentage === undefined) return "?";

    let sorted = Object.keys(gradingScale).sort(
        (a, b) => Number.parseFloat(b) - Number.parseFloat(a)
    );
    for (let s of sorted) {
        if (percentage >= Number.parseInt(s)) {
            return gradingScale[s];
        }
    }
    return "?";
}
