const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
    {
        name: String,

        groupAdmin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        members: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        description: {
            type: String,
            default: "",
        },

        contracts: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Contract",
            },
        ],

        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Group", groupSchema);