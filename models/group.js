const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
    name: String,

    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        required: true
    },

    assignmentType: {
        type: String,
        enum: ["TASK", "CONTRACT"],
        required: true
    },

    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
        default: null
    },

    contract: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Contract",
        default: null
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    members: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            role: {
                type: String,
                enum: ["GROUP_ADMIN", "EMPLOYEE"],
                default: "EMPLOYEE"
            }
        }
    ],

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }

}, { timestamps: true });
groupSchema.index({ "members.user": 1 });
groupSchema.index({ company: 1, contract: 1 });
groupSchema.index({ company: 1, task: 1 });
module.exports = mongoose.model("Group", groupSchema);