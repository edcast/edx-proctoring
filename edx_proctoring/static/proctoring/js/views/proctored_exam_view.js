var edx = edx || {};

(function (Backbone, $, _, gettext) {
    'use strict';

    edx.coursware = edx.coursware || {};
    edx.coursware.proctored_exam = edx.coursware.proctored_exam || {};

    edx.coursware.proctored_exam.ProctoredExamView = Backbone.View.extend({
        initialize: function (options) {
            this.$el = options.el;
            this.model = options.model;
            this.templateId = options.proctored_template;
            this.template = null;
            this.timerId = null;
            this.timerTick = 0;
            /* give an extra 5 seconds where the timer holds at 00:00 before page refreshes */
            this.grace_period_secs = 5;

            // we need to keep a copy here because the model will
            // get destroyed before onbeforeunload is called
            this.taking_as_proctored = false;

            var template_html = $(this.templateId).text();
            if (template_html !== null) {
                /* don't assume this backbone view is running on a page with the underscore templates */
                this.template = _.template(template_html);
            }

            var controls_template_html = $(this.examControlsTemplateId).text();
            if (controls_template_html !== null) {
                /* don't assume this backbone view is running on a page with the underscore templates */
                this.controls_template = _.template(controls_template_html);
            }

            /* re-render if the model changes */
            this.listenTo(this.model, 'change', this.modelChanged);

            $(window).unbind('beforeunload', this.unloadMessage);

            /* make the async call to the backend REST API */
            /* after it loads, the listenTo event will file and */
            /* will call into the rendering */
            this.model.fetch();
        },
        modelChanged: function () {
            // if we are a proctored exam, then we need to alert user that he/she
            // should not be navigating around the courseware
            var taking_as_proctored = this.model.get('taking_as_proctored');
            var time_left = this.model.get('time_remaining_seconds') > 0;
            var status = this.model.get('attempt_status');
            var in_courseware = document.location.href.indexOf('/courses/' + this.model.get('course_id') + '/courseware/') > -1;

            if ( taking_as_proctored && time_left && in_courseware && status !== 'started'){
                $(window).bind('beforeunload', this.unloadMessage);
            } else {
                // remove callback on unload event
                $(window).unbind('beforeunload', this.unloadMessage);
            }

            this.render();
        },
        render: function () {
            if (this.template !== null) {
                if (
                    this.model.get('in_timed_exam') &&
                    this.model.get('time_remaining_seconds') > 0 &&
                    this.model.get('attempt_status') !== 'error'
                ) {
                    var html = this.template(this.model.toJSON());
                    this.$el.html(html);
                    this.$el.show();
                    this.updateRemainingTime(this);
                    this.timerId = setInterval(this.updateRemainingTime, 1000, this);

                    // Bind a click handler to the exam controls
                    var self = this;
                    $('.exam-button-turn-in-exam').click(function(){
                        $(window).unbind('beforeunload', self.unloadMessage);

                        $.ajax({
                            url: '/api/edx_proctoring/v1/proctored_exam/attempt/' + self.model.get('attempt_id'),
                            type: 'PUT',
                            data: {
                              action: 'stop'
                            },
                            success: function() {
                              // Reloading page will reflect the new state of the attempt
                              location.reload();
                            }
                        });
                    });
                    //$('.proctored-exam-action-stop').css('cursor', 'pointer');
                }
            }
            return this;
        },
        reloadPage: function () {
          location.reload();
        },
        unloadMessage: function  () {
            return gettext("Are you sure you want to leave this page? \n" +
                "To pass your proctored exam you must also pass the online proctoring session review.n");
        },
        updateRemainingTime: function (self) {
            self.timerTick ++;
            if (self.timerTick % 5 === 0){
                var url = self.model.url + '/' + self.model.get('attempt_id');
                $.ajax(url).success(function(data) {
                    if (data.status === 'error') {
                        // The proctoring session is in error state
                        // refresh the page to
                        clearInterval(self.timerId); // stop the timer once the time finishes.
                        $(window).unbind('beforeunload', self.unloadMessage);
                        // refresh the page when the timer expired
                        location.reload();
                    }
                });
            }
            self.$el.find('div.exam-timer').removeClass("low-time warning critical");
            self.$el.find('div.exam-timer').addClass(self.model.getRemainingTimeState());
            self.$el.find('span#time_remaining_id b').html(self.model.getFormattedRemainingTime());
            if (self.model.getRemainingSeconds() <= -self.grace_period_secs) {
                clearInterval(self.timerId); // stop the timer once the time finishes.
                $(window).unbind('beforeunload', this.unloadMessage);
                // refresh the page when the timer expired
                self.reloadPage();
            }
        }
    });
    this.edx.coursware.proctored_exam.ProctoredExamView = edx.coursware.proctored_exam.ProctoredExamView;
}).call(this, Backbone, $, _, gettext);
